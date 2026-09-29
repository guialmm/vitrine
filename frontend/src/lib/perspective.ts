export type Point = readonly [number, number];

/** Solves A·x = b (n×n) by Gaussian elimination with partial pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * CSS matrix3d() that maps the rectangle (0,0)–(w,h) onto an arbitrary
 * quadrilateral [top-left, top-right, bottom-right, bottom-left]: a planar
 * homography, i.e. what "distort → perspective" does in Photoshop.
 */
export function rectToQuad(w: number, h: number, quad: readonly [Point, Point, Point, Point]): string {
  const src: Point[] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  // x' = (a x + b y + c) / (g x + h y + 1),  y' = (d x + e y + f) / (g x + h y + 1)
  const A: number[][] = [];
  const B: number[] = [];
  src.forEach(([x, y], i) => {
    const [X, Y] = quad[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
    B.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
    B.push(Y);
  });
  const [a, b, c, d, e, f, g, hh] = solve(A, B);
  // matrix3d is column-major.
  return `matrix3d(${[a, d, 0, g, b, e, 0, hh, 0, 0, 1, 0, c, f, 0, 1].join(",")})`;
}
