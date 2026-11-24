// Historical binary64 evaluator used for Stoke prestige and You Are Conscious
// reflection. Operation order, history and refusal messages affect existing play.
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * (b[i] ?? 0), 0);
const matVec = (matrix, vector) => matrix.map(row => dot(row, vector));
const l2norm = vector => Math.sqrt(dot(vector, vector));

export function dominantEigen(matrix, { iterations = 200, tol = 1e-12, seedVector } = {}) {
  const n = matrix.length;
  if (n === 0) return { lambda: 0, vector: [], history: [], converged: true };
  let vector = seedVector ? [...seedVector] : Array(n).fill(1 / Math.sqrt(n));
  const startNorm = l2norm(vector);
  if (startNorm > 0) vector = vector.map(x => x / startNorm);
  const history = [];
  let converged = false;
  for (let step = 0; step < iterations; step++) {
    const product = matVec(matrix, vector);
    const norm = l2norm(product);
    history.push(dot(vector, product));
    if (norm === 0) return { lambda: 0, vector, history, converged: true };
    const next = product.map(x => x / norm);
    // A negative dominant eigenvalue can flip the direction at every step.
    const distance = Math.min(l2norm(next.map((x, i) => x - (vector[i] ?? 0))),
                              l2norm(next.map((x, i) => x + (vector[i] ?? 0))));
    vector = next;
    if (distance < tol) {
      converged = true;
      history.push(dot(vector, matVec(matrix, vector)));
      break;
    }
  }
  const lambda = history[history.length - 1] ?? 0;
  const sum = vector.reduce((total, x) => total + x, 0);
  if ((vector.every(x => x >= -1e-9) || vector.every(x => x <= 1e-9)) && Math.abs(sum) > 1e-12) {
    vector = vector.map(x => x / sum);
  }
  return { lambda, vector, history, converged };
}

// The two games gate production on this historical estimate, including its
// near-zero threshold. A finite iteration budget can leave a periodic graph unsettled.
export function assessGraphMatrix(matrix) {
  for (const row of matrix) {
    for (const value of row) {
      if (value < 0) return { valid: false, reason: "matrix has a negative entry — not a valid PF production matrix" };
    }
  }
  if (Math.abs(dominantEigen(matrix).lambda) < 1e-9) {
    return { valid: false, reason: "no growth loop yet — this production graph is acyclic (dominant eigenvalue is 0)" };
  }
  return { valid: true };
}
