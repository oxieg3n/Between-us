import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { FREE_QUOTAS, estimateCapacity, assessUsage } from '../src/free-plan.ts';

// Explicit offline operator artifact. Never reads environment, credentials or live provider telemetry.
async function main(args) {
  const sample = args[0] === '--sample';
  if ((!sample && args[0] !== '--input') || (sample ? args.length !== 3 || args[1] !== '--output' : args.length !== 4 || args[2] !== '--output')) throw Error();
  const output = path.resolve(args[sample ? 2 : 3]);
  let snapshot;
  const now = Date.now();
  if (sample) snapshot = { plan: 'free', projectAvailable: true, collectedAtMs: now, metrics: Object.fromEntries(Object.keys(FREE_QUOTAS).map(k => [k, 0])) };
  else { const input = args[1]; if ((await stat(input)).size > 16_384) throw Error(); snapshot = JSON.parse(await readFile(input, 'utf8')); }
  const assessment = assessUsage(snapshot, now);
  if (assessment.reason === 'invalid_input') throw Error();
  const artifact = { format: 'between-us-free-budget-v1', source: sample ? 'synthetic-sample' : 'operator-supplied-unverified',
    generatedAt: new Date(now).toISOString(), approval: 'Engineering defaults 50/70/90%; owner operating approval required.',
    enforcement: false, hostedTelemetryCollected: false, assessment, scenarios: [3, 10, 100, 500].map(n => estimateCapacity(n)) };
  const rows = artifact.scenarios.map(s => `<tr><td>${s.families}</td><td>${(s.estimates.databaseBytes / 1e6).toFixed(1)}</td><td>${(s.estimates.uncachedEgressBytes / 1e9).toFixed(2)}</td><td>${s.estimates.edgeInvocations}</td><td>${s.estimates.peakRealtimeConnections}</td><td>${s.limits.filter(m => m.band === 'unavailable').map(m => m.name).join(', ') || 'None projected'}</td></tr>`).join('');
  const metrics = assessment.metrics.map(m => `<tr><td>${m.name}</td><td>${m.used}</td><td>${m.quota}</td><td>${(m.ratio * 100).toFixed(1)}%</td><td>${m.band}</td></tr>`).join('');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Between Us Free plan operating budget</title><style>body{font:17px/1.6 system-ui;color:#253746;background:#f7fafc;max-width:1100px;margin:40px auto;padding:0 24px}h1,h2{font-family:Georgia,serif}table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:10px;text-align:left;border-bottom:1px solid #cbd8df}caption{text-align:left;font-weight:bold}.scroll{overflow:auto}</style><h1>Free plan operating budget</h1><p>Source: ${artifact.source}. Current state: ${assessment.state}. ${artifact.generatedAt}</p><p>${artifact.approval} Offline operator artifact; no enforcement or hosted proof. Synthetic sample values are zero by construction.</p><h2>Aggregate usage supplied by the operator</h2><div class="scroll"><table><caption>Quota bands</caption><thead><tr><th>Metric</th><th>Used</th><th>Quota</th><th>Used %</th><th>Band</th></tr></thead><tbody>${metrics}</tbody></table></div><p>Reason: ${assessment.reason}. Allow mutations: ${assessment.allowMutations}. Allow background work: ${assessment.allowBackgroundWork}. Allow new families: ${assessment.allowNewFamilies}.</p><h2>Projected scenarios</h2><p>Estimates at a 365-day finance growth horizon; four full logical exports/month share uncached egress. No ledger deletion, measured capacity or burst guarantee is implied. Complete assumptions are in dashboard.json.</p><div class="scroll"><table><caption>Conservative planning assumptions, not hosting qualification</caption><thead><tr><th>Families</th><th>Database MB</th><th>Uncached GB/month</th><th>Edge calls/month</th><th>Peak sockets</th><th>At least 90% of quota</th></tr></thead><tbody>${rows}</tbody></table></div><p>Public enrollment and real child data remain off. No provider or paid fallback is configured. Safety resources remain independent of backend availability.</p></html>`;
  const cap = artifact.scenarios[0].applicationCapacity;
  const applicationWarning = `<h2>Checkpoint history and active-work limits</h2><p>Validated checkpoints keep the hot replay tail at128 visible /32 private events per child while retaining every accepted event and command identity in the append-only database. Under these planning assumptions, a hot tail rolls over around ${cap.hotTailRolloverDays.visible?.toFixed(1) ?? 'no visible activity'} visible / ${cap.hotTailRolloverDays.hidden?.toFixed(1) ?? 'no private activity'} days; these are not history expiry dates. Settled source-connected records archive without losing correction provenance. Live work remains bounded at100 occurrences and32 payouts; long-running connected savings obligations can require capacity review. No automatic deletion or limit increase occurs. Local longevity evidence is separate from hosted CPU/memory qualification, which remains unverified.</p>`;
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'dashboard.json'), JSON.stringify(artifact, null, 2) + '\n', { mode: 0o600 });
  await writeFile(path.join(output, 'dashboard.html'), html.replace('</html>', applicationWarning + '</html>'), { mode: 0o600 });
  process.stdout.write(JSON.stringify({ status: 'prepared', source: artifact.source, state: assessment.state, files: ['dashboard.json', 'dashboard.html'], enforcement: false, hostedTelemetryCollected: false }) + '\n');
}
main(process.argv.slice(2)).catch(() => { process.stderr.write('Budget dashboard refused: use --sample --output DIR or --input AGGREGATE_JSON --output DIR; strict numeric input required.\n'); process.exitCode = 1; });
