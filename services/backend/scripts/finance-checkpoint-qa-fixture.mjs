/** Explicit fictional LOCAL fixture for native archive QA; no source rows are erased. */
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { localUiFixturePath } from '../../../apps/mobile/e2e-production/fixture-path.ts';
import { sourceGuard } from '../recovery/guards.mjs';

async function main() {
  if (process.argv.length !== 4 || process.argv[2] !== '--confirm-isolated-fictional-finance-qa') throw Error();
  const file = localUiFixturePath(process.argv[3]);
  if (!/[\\/]ui-runs[\\/][a-f0-9]{32}[\\/]mobile-fixture.json$/.test(file)) throw Error();
  const fixture = JSON.parse(await readFile(file, 'utf8'));
  if (fixture.financeArchiveQa || fixture.url !== 'http://127.0.0.1:54321' || fixture.apiUrl !== 'http://127.0.0.1:8787'
    || ![fixture.parent, fixture.child].every(p => p.email.endsWith('.test'))) throw Error();
  const config = JSON.parse((await readFile(new URL('../.local/status.json', import.meta.url), 'utf8')).replace(/^\uFEFF/, ''));
  sourceGuard(config);
  const database = new pg.Client({ connectionString: config.DB_URL }); await database.connect();
  const people = [];
  try {
    const policy = (await database.query('select * from app_private.deployment_policy where singleton')).rows[0];
    if (!policy.local_synthetic || policy.public_enrollment_enabled || policy.real_child_data_enabled || policy.public_reports_enabled) throw Error();
    const health = await fetch(`${fixture.apiUrl}/health`).then(r => r.json());
    if (health.build !== '1116-FinanceCheckpoints-r2') throw Error();
    for (const person of [fixture.parent, fixture.child]) {
      const auth = createClient(fixture.url, fixture.publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const result = await auth.auth.signInWithPassword({ email: person.email, password: person.password });
      if (result.error || result.data.user?.id !== person.id) throw Error();
      people.push({ auth, token: result.data.session.access_token });
    }
    const endpoint = `${fixture.apiUrl}/v1/finance/${fixture.familyId}/${fixture.childId}`;
    let commands = 0;
    async function command(actor, action, id = randomUUID()) {
      const response = await fetch(endpoint, { method: 'POST', headers: { authorization: `Bearer ${people[actor].token}`, 'content-type': 'application/json' }, body: JSON.stringify({ id, action }) });
      if (!response.ok) throw Error(); commands++; return await response.json();
    }
    const today = new Date().toISOString().slice(0, 10), paidAt = `${today}T00:00:00.000Z`;
    await command(0, { kind: 'configure_plan', plan: { budgetCents: 5000, period: 'monthly', anchorDate: today, payoutCadence: 'per_task', minimumPayoutCents: 0, allowGoalRelease: true } });
    await command(0, { kind: 'configure_matching', rule: { enabled: true, percent: 100, monthlyCapCents: 2000, parentBudgetCents: 2000, surprise: true } });
    const goalId = randomUUID(), choreId = randomUUID(), occurrenceId = `${choreId}:${today}`;
    await command(1, { kind: 'create_goal', goalId, title: 'A fictional bicycle', targetCents: 5000 });
    await command(0, { kind: 'assign_chore', choreId, title: 'Fictional garden watering', rewardCents: 100, dates: [today] });
    await command(1, { kind: 'submit_chore', occurrenceId });
    await command(0, { kind: 'review_chore', occurrenceId, decision: 'approved' });
    const allocation = randomUUID(); await command(1, { kind: 'allocate', goalId, amountCents: 100 }, allocation);
    const matchId = `${fixture.child.id}:${allocation}:match`;
    await command(0, { kind: 'fund_match', matchId, amountCents: 50, method: 'manual', paidAt });
    await command(1, { kind: 'release_goal', goalId, amountCents: 100, note: 'Fictional goal release' });
    const payout = randomUUID(); await command(1, { kind: 'request_payout', amountCents: 100 }, payout);
    await command(0, { kind: 'report_payment', payoutId: `${fixture.child.id}:${payout}`, amountCents: 100, method: 'cash', paidAt });
    // Four bounded25-day assignments retire only explicitly cancelled work and settled sources.
    for (let batch = 0; batch < 4; batch++) {
      const id = randomUUID(), dates = Array.from({ length: 25 }, (_, i) => new Date(Date.parse(`${today}T00:00:00Z`) + (batch * 25 + i) * 86400000).toISOString().slice(0, 10));
      await command(0, { kind: 'assign_chore', choreId: id, title: 'Fictional cancelled practice task', rewardCents: 1, dates });
      for (const date of dates) await command(0, { kind: 'close_chore', occurrenceId: `${id}:${date}`, status: 'cancelled', note: 'Cancelled fictional QA task' });
    }
    const records = await fetch(`${endpoint}/history`, { headers: { authorization: `Bearer ${people[1].token}` } }).then(r => r.ok ? r.json() : Promise.reject());
    const parent = await fetch(`${endpoint}/parent-history`, { headers: { authorization: `Bearer ${people[0].token}` } }).then(r => r.ok ? r.json() : Promise.reject());
    if (!records.items.length || !parent.items.some(r => r.match.id === matchId)) throw Error();
    fixture.financeArchiveQa = { occurrenceId, matchId, goalId, commands, build: health.build };
    await writeFile(file, JSON.stringify(fixture, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ status: 'PASS', commands, visiblePageRows: records.items.length, privatePageRows: parent.items.length, credentialsPrinted: false, sourceHistoryErased: false }));
  } finally {
    for (const person of people) await person.auth.auth.signOut({ scope: 'local' }).catch(() => {});
    await database.end();
  }
}
main().catch(() => { console.error('Isolated fictional finance QA fixture refused or incomplete; existing source history retained.'); process.exitCode = 1; });
