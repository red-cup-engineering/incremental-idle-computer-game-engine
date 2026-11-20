// Rows are destinations and columns are sources. Sorting node IDs keeps stocks,
// generation rates and matrix entries in the same order across saved games.
export class NegativeEdgeRateError extends RangeError {
  constructor(edge) {
    super(`edge ${edge.from} -> ${edge.to} has rate ${edge.rate}: production-graph edges must be nonnegative`);
    this.name = 'NegativeEdgeRateError';
  }
}

export function assertValidGraph(graph) {
  const ids = new Set(graph.nodes.map(node => node.id));
  if (ids.size !== graph.nodes.length) throw new RangeError('assertValidGraph: duplicate node id');
  for (const edge of graph.edges) {
    if (edge.rate < 0) throw new NegativeEdgeRateError(edge);
    if (!Number.isFinite(edge.rate)) throw new RangeError('Production rate must be a finite number');
    for (const id of [edge.from, edge.to]) {
      if (!ids.has(id)) throw new RangeError(`assertValidGraph: edge references unknown node "${id}"`);
    }
  }
}

export function isNonNegative(graph) {
  return graph.edges.every(edge => Number.isFinite(edge.rate) && edge.rate >= 0);
}

export function nodeOrder(graph) {
  return graph.nodes.map(node => node.id).sort();
}

export function toMatrix(graph) {
  assertValidGraph(graph);
  const order = nodeOrder(graph);
  const index = new Map(order.map((id, i) => [id, i]));
  const matrix = order.map(() => Array(order.length).fill(0));
  for (const edge of graph.edges) matrix[index.get(edge.to)][index.get(edge.from)] += edge.rate;
  return {order, matrix};
}

export function baseVector(graph, order) {
  const rates = new Map(graph.nodes.map(node => [node.id, node.baseGeneration]));
  return order.map(id => rates.get(id) ?? 0);
}

export const TICK_INTERVAL_MS = 1000;
export const STOCK_CLAMP = 1e250;

export function ticksBetween(fromTs, toTs) {
  if (!Number.isFinite(fromTs) || !Number.isFinite(toTs)) throw new RangeError('Production timestamps must be finite');
  if (toTs < fromTs) throw new RangeError(`ticksBetween: toTs (${toTs}) is before fromTs (${fromTs}) — time does not run backward in this engine`);
  const ticks = Math.floor(toTs / TICK_INTERVAL_MS) - Math.floor(fromTs / TICK_INTERVAL_MS);
  if (!Number.isSafeInteger(ticks)) throw new RangeError('Production tick count exceeds the safe integer range');
  return ticks;
}

function clampStock(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(-STOCK_CLAMP, Math.min(STOCK_CLAMP, value));
}

function identity(size) {
  return Array.from({length: size}, (_, i) => Array.from({length: size}, (_, j) => Number(i === j)));
}

function multiply(left, right) {
  const result = left.map(() => Array(right.length).fill(0));
  for (let i = 0; i < left.length; i++) {
    for (let k = 0; k < right.length; k++) {
      const factor = left[i][k];
      if (factor === 0) continue;
      for (let j = 0; j < right.length; j++) result[i][j] += factor * right[k][j];
    }
  }
  // Bound each product before the next squaring, including when the player was away for years.
  return result.map(row => row.map(clampStock));
}

export function advance(state, fromTs, toTs) {
  const ticks = ticksBetween(fromTs, toTs);
  if (ticks === 0 || state.graph.nodes.length === 0) return state;
  const {order, matrix} = toMatrix(state.graph);
  const generation = baseVector(state.graph, order);
  // One tick keeps existing stock, adds production from connected nodes and
  // adds base generation. The final coordinate carries the constant term.
  let step = matrix.map((row, i) => [
    ...row.map((rate, j) => Number(i === j) + rate), generation[i],
  ]);
  step.push([...order.map(() => 0), 1]);
  let accumulated = identity(step.length);
  for (let remaining = ticks; remaining > 0; remaining = Math.floor(remaining / 2)) {
    if (remaining % 2 === 1) accumulated = multiply(accumulated, step);
    if (remaining > 1) step = multiply(step, step);
  }
  const initial = [...order.map(id => state.stocks[id] ?? 0), 1];
  const stocks = {...state.stocks};
  for (const [i, id] of order.entries()) {
    stocks[id] = clampStock(accumulated[i].reduce((sum, value, j) => sum + value * initial[j], 0));
  }
  return {graph: state.graph, stocks};
}
