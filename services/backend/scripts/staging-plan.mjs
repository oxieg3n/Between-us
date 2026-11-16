import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPreflight, validateTarget } from './staging-preflight.mjs';

export function prepareCommands(preflight, confirmation) {
  if (preflight?.mode !== 'hosted-staging-preparation' || !/^[a-z]{20}$/.test(preflight.target?.projectRef)
    || !/^[a-f0-9]{64}$/.test(preflight.fingerprint) || confirmation !== `PLAN:${preflight.target.projectRef}:${preflight.fingerprint}`) throw Error();
  validateTarget(preflight.target, { schemaVersion: 1, targets: [preflight.target] });
  const remote = `--remote=${preflight.target.projectRef}`;
  return [
    { purpose: 'Owner-authorized remote migration preview (network required)', argv: ['node', 'node_modules/supabase/dist/supabase.js', 'db', 'push', remote, '--skip-vault', '--dry-run'] },
    { purpose: 'Later separately authorized migration application', argv: ['node', 'node_modules/supabase/dist/supabase.js', 'db', 'push', remote, '--skip-vault'] },
    { purpose: 'Later separately authorized api deployment; CLI has no deployment dry-run', argv: ['node', 'node_modules/supabase/dist/supabase.js', 'functions', 'deploy', 'api', remote] },
  ];
}
async function main(args) {
  if (args.length === 1 && args[0] === '--dry-run') {
    const local = await runPreflight({ local: true });
    process.stdout.write(JSON.stringify({ ...local, commands: [], blocked: 'OWNER_APPROVED_STAGING_TARGET_REQUIRED', executed: false }, null, 2) + '\n'); return;
  }
  if (args.length !== 5 || args[0] !== '--dry-run' || args[1] !== '--target' || args[3] !== '--confirm') throw Error();
  const preflight = await runPreflight({ targetPath: args[2] });
  const commands = prepareCommands(preflight, args[4]);
  process.stdout.write(JSON.stringify({ ...preflight, commands, executed: false, blocked: 'OWNER_REMOTE_EXECUTION_APPROVAL_REQUIRED' }, null, 2) + '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(() => { process.stderr.write('Offline staging plan refused: exact reviewed target and current PLAN:ref:fingerprint confirmation required. No command executed.\n'); process.exitCode = 1; });
}
