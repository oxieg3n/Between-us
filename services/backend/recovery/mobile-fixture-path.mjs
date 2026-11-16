export function mobileFixturePlan(args, runId) {
  const isolated = args.length === 1 && args[0] === '--isolated-ui-run';
  const replace = args.length === 1 && args[0] === '--replace-fictional-fixture';
  if (args.length && !isolated && !replace) throw Error('Unrecognized mobile fixture arguments.');
  if (isolated && !/^[a-f0-9]{32}$/.test(runId)) throw Error('Invalid isolated fixture identity.');
  return { isolated, replace, relativePath: isolated ? `.local/ui-runs/${runId}/mobile-fixture.json` : '.local/mobile-fixture.json',
    writeFlag: replace ? 'w' : 'wx', runId: isolated ? runId : null };
}
