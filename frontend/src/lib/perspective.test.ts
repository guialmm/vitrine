import { describe, expect, it } from "vitest";

import { rectToQuad } from "./perspective";
import type { Point } from "./perspective";

function apply(matrix: string, [x, y]: Point): Point {
  const m = matrix.slice("matrix3d(".length, -1).split(",").map(Number);
  // Column-major 4x4 applied to (x, y, 0, 1), then perspective divide.
  const X = m[0] * x + m[4] * y + m[12];
  const Y = m[1] * x + m[5] * y + m[13];
  const W = m[3] * x + m[7] * y + m[15];
  return [X / W, Y / W];
}

describe("rectToQuad", () => {
  const quad = [[566, 306], [996, 334], [962, 832], [558, 776]] as const;

  it("maps each rectangle corner onto the matching quad corner", () => {
    const m = rectToQuad(400, 464, quad);
    const corners: Point[] = [[0, 0], [400, 0], [400, 464], [0, 464]];
    corners.forEach((c, i) => {
      const [x, y] = apply(m, c);
      expect(x).toBeCloseTo(quad[i][0], 6);
      expect(y).toBeCloseTo(quad[i][1], 6);
    });
  });

  it("is a plain scale + translate for an axis-aligned target", () => {
    const m = rectToQuad(100, 50, [[10, 20], [210, 20], [210, 120], [10, 120]]);
    expect(apply(m, [50, 25])).toEqual([110, 70]);
  });
});
