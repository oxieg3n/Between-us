import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { integrationFixture, sessionId, success } from './integration-fixtures.ts';

type Hint = { id?: unknown; user_id?: unknown; [key: string]: unknown };
function fixedTokenClient(publicKey: string, token: string) {
  return createClient('http://127.0.0.1:54321', publicKey, {
    db: { schema: 'api' }, accessToken: async () => token,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { timeout: 10_000, heartbeatIntervalMs: 1000, logger: () => {} },
  });
}
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function until(condition: () => boolean | Promise<boolean>, step: string, milliseconds = 15_000) {
  const end = performance.now() + milliseconds;
  while (!(await condition())) { assert.ok(performance.now() < end, step); await delay(100); }
}

test('real WebSocket hint RLS denies a revoked managed session while a current child positive control still receives INSERTs', { timeout: 120_000 }, async t => {
  const f = await integrationFixture();
  const sockets: ReturnType<typeof fixedTokenClient>[] = [];
  const fixtureHints: string[] = [];
  let verificationAdded = false;
  try {
    assert.ok(f.child && f.operator);
    assert.equal(typeof globalThis.WebSocket, 'function', 'Node runtime must provide a real WebSocket transport');
    const parentToken = f.parent.session.access_token, childToken = f.child.session.access_token;
    const parentExpiry = f.parent.session.expires_at;
    assert.ok(typeof parentExpiry === 'number' && parentExpiry * 1000 > Date.now() + 30_000, 'captured managed JWT remains unexpired during revocation test');

    const added = await f.database.query("insert into app_private.operators(user_id,scope,active) values($1,'verification',true) on conflict do nothing returning user_id", [f.operator.user.id]);
    verificationAdded = added.rows.length === 1;
    success(await f.parent.auth.rpc('request_contact', { p_family_id: f.familyId, p_recipient_email: f.child.email }), 'guardian contact invitation');
    const contact = (await f.database.query(`select id from app_private.trusted_contacts where a=least($1::uuid,$2::uuid)
      and b=greatest($1::uuid,$2::uuid)`, [f.parent.user.id, f.child.user.id])).rows[0];
    assert.ok(contact?.id, 'contact fixture exists only after actual authorized invitation');
    success(await f.child.auth.rpc('accept_contact', { p_contact_id: contact.id }), 'independent child contact acceptance');
    success(await f.parent.auth.rpc('approve_contact', { p_contact_id: contact.id }), 'guardian child-contact approval');
    success(await f.service.rpc('verify_contact', { p_contact_id: contact.id, p_operator_id: f.operator.user.id,
      p_method: 'synthetic_fixture', p_evidence_ref: 'fixture:independent-realtime-contact-only' }), 'independent fixture verification');
    const conversation = success(await f.child.auth.rpc('create_conversation', { p_contact_id: contact.id }), 'actual authorized conversation');

    // These clients never sign in/out or receive Auth session events. Each token
    // callback always returns its immutable original managed JWT, including after
    // remote revocation. A missing event cannot be credited to client unsubscribe.
    const fixed = (token: string) => {
      const socket = fixedTokenClient(f.publicKey, token);
      sockets.push(socket); return socket;
    };
    const parentSocket = fixed(parentToken), childSocket = fixed(childToken), foreignSocket = fixed(f.operator.session.access_token);
    const parentHints: Hint[] = [], childHints: Hint[] = [], foreignHints: Hint[] = [];
    const snapshot = async (stage: string, channel?: RealtimeChannel) => {
      const rows = (await f.database.query(`select subscription_id::text id,
        case claims->>'sub' when $1::text then 'parent' when $2::text then 'child' when $3::text then 'observer' else 'other' end account,
        action_filter,
        (select jsonb_agg(jsonb_build_object('column',filter.column_name,'op',filter.op::text,
          'own',filter.value=s.claims->>'sub','parent',filter.value=$1::text,'child',filter.value=$2::text)) from unnest(s.filters) filter) filters
        from realtime.subscription s where entity='api.user_invalidations'::regclass order by id`,
      [f.parent.user.id, f.child!.user.id, f.operator!.user.id])).rows;
      const bindings = (channel as unknown as { bindings?: { postgres_changes?: { id?: unknown }[] } })?.bindings?.postgres_changes ?? [];
      t.diagnostic(`Realtime registration snapshot: ${JSON.stringify({ stage, count: rows.length, rows,
        channelJoined: channel?.state === 'joined', bindingIds: bindings.map(binding => binding.id).filter(id => typeof id === 'string' || typeof id === 'number') })}`);
    };
    const registered = async (subject: string, target: string) => (await f.database.query(`select exists(select 1 from realtime.subscription s
      where entity='api.user_invalidations'::regclass and claims->>'sub'=$1::text and action_filter in('*','INSERT')
      and exists(select 1 from unnest(s.filters) filter where filter.column_name='user_id' and filter.op='eq' and filter.value=$2::text)) present`, [subject, target])).rows[0].present === true;
    const requireRegistrations = async (entries: [string, string][], stage: string) => {
      try {
        await until(async () => (await Promise.all(entries.map(([subject, target]) => registered(subject, target)))).every(Boolean),
          `${stage}: actual server registrations must be ready before markers`, 20_000);
      } finally { await snapshot(`${stage}: registration readiness`); }
    };
    const subscribe = async (socket: ReturnType<typeof fixedTokenClient>, userId: string, collected: Hint[], stage: string): Promise<RealtimeChannel> => {
      // SupabaseClient bootstraps callback auth in an unawaited Promise, while
      // subscribe snapshots accessTokenValue synchronously. Await this official
      // API so the first join cannot accidentally capture the anonymous key.
      try { await socket.realtime.setAuth(); } catch { throw new Error('Fixed Realtime managed-token initialization failed.'); }
      const channel = socket.channel(`fixture-hints-${randomUUID()}`);
      let joined = false, failed = false;
      channel.on('postgres_changes', { event: 'INSERT', schema: 'api', table: 'user_invalidations', filter: `user_id=eq.${userId}` }, payload => {
        collected.push(payload.new as Hint);
      }).subscribe(status => {
        if (status === 'SUBSCRIBED') joined = true;
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') failed = true;
      });
      await until(() => joined || failed, 'local Realtime subscription did not settle');
      assert.equal(failed, false, 'local Realtime accepts the authenticated table subscription');
      assert.equal(joined, true, 'real WebSocket subscription is ready before test events');
      await snapshot(stage, channel);
      return channel;
    };
    // Phase one proves the foreign filter with an independent positive child
    // control. No missing registration can count as a successful negative case.
    const observerChannel = await subscribe(foreignSocket, f.child.user.id, foreignHints, 'observer subscribed');
    await subscribe(childSocket, f.child.user.id, childHints, 'child subscribed');
    await requireRegistrations([[f.operator.user.id, f.child.user.id], [f.child.user.id, f.child.user.id]], 'observer and child');
    const negativeControl = randomUUID(); fixtureHints.push(negativeControl);
    await f.database.query('insert into api.user_invalidations(id,user_id) values($1,$2)', [negativeControl, f.child.user.id]);
    await until(() => childHints.some(row => row.id === negativeControl), 'child control proves the foreign-filter phase has a live pipeline');
    await delay(2000);
    assert.equal(await registered(f.operator.user.id, f.child.user.id), true, 'foreign listener remains registered throughout its negative test');
    assert.equal(observerChannel.state, 'joined'); assert.equal(foreignSocket.realtime.isConnected(), true);
    assert.equal(foreignHints.length, 0, 'a real registered observer cannot read another UID hints');
    // Deliberately retire only the already-proven observer. Phase two keeps at
    // most two subscriptions; no parent unsubscribe is performed after baseline.
    await foreignSocket.removeChannel(observerChannel); await foreignSocket.realtime.disconnect();
    await snapshot('observer retired');
    const parentChannel = await subscribe(parentSocket, f.parent.user.id, parentHints, 'parent subscribed');
    await requireRegistrations([[f.parent.user.id, f.parent.user.id], [f.child.user.id, f.child.user.id]], 'parent and child');

    const sendAndControl = async (label: string) => {
      const before = new Set<string>((await f.database.query('select id from api.user_invalidations where user_id=$1', [f.parent.user.id])).rows.map((row: { id: string }) => row.id));
      success(await f.child!.auth.rpc('send_message', { p_conversation_id: conversation.id,
        p_body: `Fictional ${label} words must never be in a hint`, p_client_id: randomUUID(), p_response: 'listen' }), 'actual child message persistence');
      const inserted = (await f.database.query('select id from api.user_invalidations where user_id=$1', [f.parent.user.id])).rows
        .map((row: { id: string }) => row.id).filter((id: string) => !before.has(id));
      assert.equal(inserted.length, 1, 'actual message creates one recipient invalidation');
      fixtureHints.push(inserted[0]);
      // send_message invalidates its recipient, not its sender. This separate
      // real WAL fixture is a positive control for the still-authorized child.
      const control = randomUUID(); fixtureHints.push(control);
      await f.database.query('insert into api.user_invalidations(id,user_id) values($1,$2)', [control, f.child!.user.id]);
      return { recipient: inserted[0], control };
    };
    const first = await sendAndControl('before revocation');
    try {
      await until(() => parentHints.some(row => row.id === first.recipient) && childHints.some(row => row.id === first.control), 'active own subscribers must receive both first-phase markers');
    } catch (failure) {
      // Root-authorized, rollback-only diagnostic. Never emit claim values, bearer
      // tokens, provider errors or row bodies. The live subscription context is
      // tested before fixture/channel cleanup so absence is not misattributed.
      const sqlState = (error: unknown) => error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code) ? error.code : 'unclassified';
      const diagnostic: Record<string, unknown> = { parentMarkerSeen: parentHints.some(row => row.id === first.recipient),
        childMarkerSeen: childHints.some(row => row.id === first.control), parentSocketConnected: parentSocket.realtime.isConnected(),
        childSocketConnected: childSocket.realtime.isConnected(), parentJoined: parentChannel.state === 'joined' };
      try {
        const subscriptions = (await f.database.query(`select s.claims,s.claims_role::text database_role,s.action_filter,s.selected_columns,
          (select jsonb_agg(jsonb_build_object('column',filter.column_name,'op',filter.op::text,
            'ownValue',filter.value=s.claims->>'sub','parentValue',filter.value=$2::text,'childValue',filter.value=$3::text,
            'quotedOwnValue',filter.value=to_jsonb(s.claims->>'sub')::text)) from unnest(s.filters) filter) filter_meta
          from realtime.subscription s where s.entity='api.user_invalidations'::regclass and s.claims->>'sub'=any($1::text[])`,
        [[f.parent.user.id, f.child.user.id, f.operator.user.id], f.parent.user.id, f.child.user.id])).rows;
        const probes: Record<string, unknown>[] = [];
        for (const row of subscriptions) {
          const claims = row.claims as Record<string, unknown>, subject = claims.sub as string;
          const probe: Record<string, unknown> = { account: subject === f.parent.user.id ? 'parent' : subject === f.child.user.id ? 'child' : 'observer', claimKeys: Object.keys(claims).sort(),
            ownUidMatches: claims.sub === subject, authenticatedRole: claims.role === 'authenticated',
            futureExpiry: typeof claims.exp === 'number' && claims.exp * 1000 > Date.now(), hasSessionId: typeof claims.session_id === 'string',
            databaseRole: row.database_role, action: row.action_filter, selectedColumns: row.selected_columns, filters: row.filter_meta };
          try {
            await f.database.query('begin');
            await f.database.query(`create function pg_temp.rt_set_claims(p_claims jsonb) returns void language plpgsql as $$
              begin perform set_config('request.jwt.claims',p_claims::text,true);end $$;
              create function pg_temp.rt_actor_probe(p_subject uuid) returns jsonb language plpgsql security definer set search_path='' as $$
              declare actor_id uuid; actor_state text:='00000';
              begin
                begin actor_id:=app_private.actor();exception when others then get stacked diagnostics actor_state=returned_sqlstate;end;
                return jsonb_build_object('actorSqlState',actor_state,'actorOwn',coalesce(actor_id=p_subject,false),
                  'transactionReadOnly',current_setting('transaction_read_only')='on');
              end $$`);
            await f.database.query('set local role authenticated');
            await f.database.query('select pg_temp.rt_set_claims($1::jsonb)', [JSON.stringify(claims)]);
            const result = (await f.database.query(`select api.can_read_own_invalidation($1::uuid) as allowed,
              (select count(*)::int from api.user_invalidations where user_id=$1::uuid) as visible,
              exists(select 1 from api.user_invalidations where user_id=$1::uuid and id=$2::uuid) marker_visible,
              pg_temp.rt_actor_probe($1::uuid) as actor`, [subject, subject === f.parent.user.id ? first.recipient : first.control])).rows[0];
            probe.helperAllowed = result.allowed; probe.ownRowsVisible = result.visible; probe.exactMarkerVisible = result.marker_visible; probe.actor = result.actor;
          } catch (error) { probe.probeSqlState = sqlState(error); }
          finally { await f.database.query('rollback'); }
          probes.push(probe);
        }
        diagnostic.subscriptions = probes;
        const functionMetadata = (await f.database.query(`select p.provolatile::text as volatility,p.prosecdef as security_definer,
          position('request.jwt.claims' in pg_get_functiondef(p.oid))>0 as sets_claims
          from pg_proc p where p.oid=to_regprocedure('realtime.apply_rls(jsonb,integer)')`)).rows;
        diagnostic.walrusFunction = functionMetadata;
        const walProbes: Record<string, unknown>[] = [];
        for (const [owner, marker, account] of [[f.parent.user.id, first.recipient, 'parent'], [f.child.user.id, first.control, 'child']]) {
          const walProbe: Record<string, unknown> = { account };
          try {
            await f.database.query('begin');
            walProbe.filters = (await f.database.query(`select case when claims->>'sub'=$3::text then 'parent' when claims->>'sub'=$5::text then 'child' else 'observer' end account,
              action_filter in('*','INSERT') as action_matches,
              realtime.is_visible_through_filters(array[
                row('id','uuid',2950::oid,to_jsonb($1::text),null,null)::realtime.wal_column,
                row('user_id','uuid',2950::oid,to_jsonb($2::text),null,null)::realtime.wal_column],filters) as filter_passes
              from realtime.subscription where entity='api.user_invalidations'::regclass and claims->>'sub'=any($4::text[])`,
            [marker, owner, f.parent.user.id, [f.parent.user.id, f.child.user.id, f.operator.user.id], f.child.user.id])).rows;
            const wal = { schema: 'api', table: 'user_invalidations', action: 'I', timestamp: new Date().toISOString(),
              columns: [{ name: 'id', type: 'uuid', typeoid: 2950, value: marker },
                { name: 'user_id', type: 'uuid', typeoid: 2950, value: owner }], pk: [{ name: 'id', type: 'uuid' }], identity: [] };
            walProbe.result = (await f.database.query(`select count(*)::int as batches,
              coalesce(sum(cardinality(subscription_ids)),0)::int as authorized_subscriptions,
              bool_and(coalesce(cardinality(errors),0)=0) as no_errors from realtime.apply_rls($1::jsonb)`, [JSON.stringify(wal)])).rows[0];
          } catch (error) { walProbe.sqlState = sqlState(error); }
          finally { await f.database.query('rollback'); }
          walProbes.push(walProbe);
        }
        diagnostic.directWalrus = walProbes;
      } catch (error) { diagnostic.metadataSqlState = sqlState(error); }
      t.diagnostic(`Sanitized local Realtime authorization probe: ${JSON.stringify(diagnostic)}`);
      throw failure;
    }
    await delay(500);
    assert.equal(foreignHints.length, 0, 'foreign observer cannot receive another UID invalidation stream');
    for (const [rows, owner] of [[parentHints, f.parent.user.id], [childHints, f.child.user.id]] as const) {
      assert.ok(rows.length > 0, 'positive control establishes actual delivery');
      for (const row of rows) {
        assert.deepEqual(Object.keys(row).sort(), ['id', 'user_id'], 'hint record contains only opaque id and own UID');
        assert.equal(typeof row.id, 'string'); assert.equal(row.user_id, owner);
      }
    }
    assert.equal(parentSocket.realtime.isConnected(), true, 'parent raw socket is connected before remote revocation');
    assert.equal(parentChannel.state, 'joined', 'parent subscription remains joined before remote revocation');

    // Revoke from a different service client. The immutable-token socket remains
    // untouched, so this exercises database current-session authorization.
    const revoked = await f.service.auth.admin.signOut(parentToken, 'local');
    assert.equal(revoked.error == null, true, 'actual server-side managed-session revocation');
    assert.equal((await f.database.query('select count(*)::int count from auth.sessions where id=$1', [sessionId(f.parent)])).rows[0].count, 0);
    assert.ok(parentExpiry! * 1000 > Date.now(), 'revoked captured JWT is still unexpired');
    assert.equal(parentSocket.realtime.isConnected(), true, 'remote revocation did not locally unsubscribe the fixed-token socket');
    assert.equal(parentChannel.state, 'joined', 'old raw channel remains joined while its authority is revoked');

    const second = await sendAndControl('after revocation');
    await until(() => childHints.some(row => row.id === second.control), 'current child control must receive the second marker after remote parent revocation');
    await delay(2000); // Bounded settle after the later committed positive control.
    assert.equal(parentHints.some(row => row.id === second.recipient), false, 'stale parent receives no post-revocation recipient hint');
    assert.equal(foreignHints.length, 0, 'foreign UID filter remains denied before and after revocation');
    assert.equal(parentSocket.realtime.isConnected(), true, 'absence is proven with the stale raw socket still connected');
    assert.equal(parentChannel.state, 'joined', 'absence is not explained by client channel removal');
    const secondRecord = childHints.find(row => row.id === second.control)!;
    assert.deepEqual(Object.keys(secondRecord).sort(), ['id', 'user_id']);
    assert.equal(secondRecord.user_id, f.child.user.id);
    assert.ok(parentExpiry! * 1000 > Date.now(), 'old JWT expiry is not the cause of suppressed delivery');
  } finally {
    // No token, raw frame, provider error or private message is printed/uploaded.
    try {
      await Promise.allSettled(sockets.map(socket => socket.removeAllChannels()));
      for (const socket of sockets) await socket.realtime.disconnect();
    } finally {
      try {
        if (fixtureHints.length) await f.database.query('delete from api.user_invalidations where id=any($1::uuid[])', [fixtureHints]);
        if (verificationAdded && f.operator) await f.database.query("delete from app_private.operators where user_id=$1 and scope='verification'", [f.operator.user.id]);
      } finally { await f.close(); }
    }
  }
});
