import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error The same executable local benchmark is tested before evidence is written.
import { checkpointLongevityFixture } from '../scripts/finance-checkpoint-benchmark.mjs';

test('real quarterly saving, payout and matching history exceeds old lifetime windows while hot work stays bounded', () => {
  const { result } = checkpointLongevityFixture({ weeks: 15 });
  assert.ok(result.events > 128); assert.ok(result.checkpoints > 0);
  assert.ok(result.visibleCapsules > 0); assert.ok(result.privateCapsules > 0);
  assert.ok(result.maximums.occurrences <= 100 && result.maximums.payouts <= 32 && result.maximums.tail <= 160);
  assert.equal(result.goldenBalanceAndGoalPass, true);
});
test('longevity fixture cannot request unbounded synthetic history', () => {
  for (const weeks of [0, -1, 1.1, 1041, Infinity]) assert.throws(() => checkpointLongevityFixture({ weeks }));
});
