// A session begins at an admitted idle checkpoint. Time is an explicit input,
// including on purchase attempts that decline after crediting elapsed income.
import { gameRules } from '@red-cup-engineering/game-engine/running/rules';
import { admitRun, buyProducer, buyUpgrade, prestige, project, tap } from './engine.mjs';

export function idleRules(world) {
  return gameRules(checkpoint => admitRun(world, checkpoint), (state, move) => {
    let outcome;
    switch (move.kind) {
      case 'observe': outcome = project(world, state, move.nowMs); break;
      case 'tap': outcome = tap(world, state, move.nowMs); break;
      case 'attempt-producer': outcome = buyProducer(world, state, move.id, move.count, move.nowMs); break;
      case 'attempt-upgrade': outcome = buyUpgrade(world, state, move.id, move.nowMs); break;
      case 'attempt-prestige': outcome = prestige(world, state, move.nowMs); break;
      default: throw new TypeError('Unknown idle move ' + move.kind);
    }
    const events = outcome.accepted === false ? [{ kind: 'action-refused', reason: outcome.reason }] : [];
    return { ...outcome, events };
  });
}
