import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advance, baseVector, isNonNegative, NegativeEdgeRateError, ticksBetween, toMatrix,
} from '../src/production-graph.mjs';

const graph = {
  nodes: [{id: 'workshop', baseGeneration: 0.75}, {id: 'ore', baseGeneration: 1.25}],
  edges: [
    {from: 'ore', to: 'workshop', rate: 0.15}, {from: 'ore', to: 'workshop', rate: 0.1},
    {from: 'workshop', to: 'ore', rate: 0.125},
  ],
};
const state = {graph, stocks: {ore: 4, workshop: 2, reserve: 7}};

test('production uses sorted nodes and combines parallel links in the same direction', () => {
  const {order, matrix} = toMatrix(graph);
  assert.deepEqual(order, ['ore', 'workshop']);
  assert.deepEqual(matrix, [[0, 0.125], [0.25, 0]]);
  assert.deepEqual(baseVector(graph, order), [1.25, 0.75]);
});

test('a returning player receives the stock calculated by the original games', () => {
  // Values recorded with Stoke and You Are Conscious before extracting their shared simulation.
  for (const [end, ore, workshop] of [
    [1000, 5.5, 3.75], [2001, 7.21875, 5.875],
    [31000, 1200.3841670389331, 1691.8472606983896],
    [777000, 6.579199099874425e55, 9.304392596595271e55], [1e13, 1e250, 1e250],
  ]) {
    assert.deepEqual(advance(state, 900, end), {graph, stocks: {ore, workshop, reserve: 7}});
  }
  assert.equal(advance(state, 900, 999), state);
  assert.equal(state.stocks.ore, 4);
});

test('invalid production links and unrepresentable time intervals are rejected', () => {
  const withRate = rate => ({nodes: graph.nodes, edges: [{from: 'ore', to: 'workshop', rate}]});
  assert.throws(() => toMatrix(withRate(-1)), NegativeEdgeRateError);
  for (const rate of [NaN, Infinity, '1']) {
    assert.equal(isNonNegative(withRate(rate)), false);
    assert.throws(() => toMatrix(withRate(rate)), /finite/);
  }
  assert.throws(() => toMatrix({...graph, nodes: [graph.nodes[1]]}), /unknown node/);
  assert.throws(() => toMatrix({...graph, nodes: [...graph.nodes, graph.nodes[1]]}), /duplicate/);
  for (const end of [-1, NaN, Infinity, 1e30]) assert.throws(() => ticksBetween(0, end), RangeError);
});
