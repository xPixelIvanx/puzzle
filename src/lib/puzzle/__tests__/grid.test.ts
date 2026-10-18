import { describe, expect, it } from "vitest";
import { gridFor, gridOptions, MAX_PIECES, MIN_PIECES, PIECE_TARGETS } from "../grid";

describe("gridFor", () => {
  const aspects = [0.25, 0.5, 0.5625, 0.75, 1, 1.333, 1.777, 3, 4, 10, 0.05];
  it("siempre devuelve entre 24 y 1000 piezas", () => {
    for (const a of aspects) {
      for (const t of [1, 24, 37, 100, 500, 999, 1000, 5000]) {
        const g = gridFor(a, t);
        expect(g.count).toBe(g.cols * g.rows);
        expect(g.count).toBeGreaterThanOrEqual(MIN_PIECES);
        expect(g.count).toBeLessThanOrEqual(MAX_PIECES);
        expect(g.cols).toBeGreaterThanOrEqual(2);
        expect(g.rows).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("se acerca al número pedido con piezas casi cuadradas", () => {
    for (const a of [0.75, 1, 1.333, 0.5625]) {
      for (const t of PIECE_TARGETS) {
        const g = gridFor(a, t);
        expect(Math.abs(g.count - t) / t).toBeLessThan(0.2);
        const pieceAspect = (a / g.rows) * g.cols;
        expect(pieceAspect).toBeGreaterThan(0.75);
        expect(pieceAspect).toBeLessThan(1.33);
      }
    }
  });

  it("orienta la cuadrícula según la imagen", () => {
    const landscape = gridFor(0.5625, 300); // 16:9 horizontal
    expect(landscape.cols).toBeGreaterThan(landscape.rows);
    const portrait = gridFor(1.777, 300);
    expect(portrait.rows).toBeGreaterThan(portrait.cols);
  });
});

describe("gridOptions", () => {
  it("no repite y está ordenado", () => {
    const opts = gridOptions(0.75);
    const counts = opts.map((o) => o.count);
    expect(new Set(counts).size).toBe(counts.length);
    expect([...counts].sort((a, b) => a - b)).toEqual(counts);
    expect(counts[0]).toBeGreaterThanOrEqual(24);
    expect(counts.at(-1)).toBeLessThanOrEqual(1000);
    expect(opts.length).toBeGreaterThan(6);
  });
});
