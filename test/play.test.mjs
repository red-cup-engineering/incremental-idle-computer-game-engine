import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRecordedRulePlayer } from '@red-cup-engineering/game-engine/running/rules';
import { buyProducer, newRun, tap } from '../src/engine.mjs';
import { idleRules } from '../src/play.mjs';
import { WORLDS } from '../src/worlds.mjs';

for (const world of WORLDS) {
  test(world.label + ' replays a timed refusal from an existing checkpoint and continues', () => {
    const producer = world.producers[0];
    const start = 4000;
    let checkpoint = newRun(world, start);
    for (let n = 0; n < producer.baseCost; n++) checkpoint = tap(world, checkpoint, start).state;
    checkpoint = buyProducer(world, checkpoint, producer.id, 1, start).state;
    const rules = idleRules(world);
    const player = createRecordedRulePlayer(rules, { seed: checkpoint });
    const nowMs = start + 1750;
    const expected = buyProducer(world, checkpoint, producer.id, 1, nowMs);
    assert.equal(expected.accepted, false);
    assert.ok(expected.state.banked > checkpoint.banked);
    const refused = player.play({ kind: 'attempt-producer', id: producer.id, count: 1, nowMs });
    assert.deepEqual(refused.state, expected.state);
    assert.deepEqual(refused.events, [{ kind: 'action-refused', reason: expected.reason }]);
    assert.equal(player.moves, 1);
    const resumed = createRecordedRulePlayer(rules, { seed: checkpoint, record: player.record, expectedStateHash: player.stateHash() });
    const next = nowMs + 250;
    assert.deepEqual(resumed.play({ kind: 'tap', nowMs: next }).state, tap(world, expected.state, next).state);
    const before = resumed.stateHash();
    assert.throws(() => resumed.play({ kind: 'unknown', nowMs: next }), /Unknown idle move/);
    assert.equal(resumed.stateHash(), before);
    assert.equal(resumed.moves, 2);
  });
}
