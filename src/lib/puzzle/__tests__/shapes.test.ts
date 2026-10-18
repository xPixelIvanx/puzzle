import { describe, expect, it } from "vitest";
import { createPuzzleDef, outlineOf } from "../board";
import { generateEdges, MAX_TAB_EXTENT, outlineBounds, type PathCmd } from "../shapes";

const def = createPuzzleDef({ cols: 6, rows: 4, aspect: 0.75, seed: 123, rotate: false });

function endpoint(c: PathCmd) {
  return { x: c.x, y: c.y };
}


describe("bordes de piezas", () => {
  it("cada contorno es cerrado", () => {
    for (let i = 0; i < def.count; i++) {
      const o = outlineOf(def, i);
      const last = endpoint(o.cmds[o.cmds.length - 1]);
      expect(last.x).toBeCloseTo(o.start.x, 9);
      expect(last.y).toBeCloseTo(o.start.y, 9);
    }
  });

  it("los lados exteriores son rectos y los interiores tienen 3 curvas", () => {
    for (let i = 0; i < def.count; i++) {
      const p = def.pieces[i];
      const o = outlineOf(def, i);
      const lines = o.cmds.filter((c) => c.t === "L").length;
      const curves = o.cmds.filter((c) => c.t === "C").length;
      const border = Number(p.row === 0) + Number(p.row === 3) + Number(p.col === 0) + Number(p.col === 5);
      expect(lines).toBe(border);
      expect(curves).toBe((4 - border) * 3);
    }
  });

  /** Divide un contorno en sus 4 lados como listas de puntos (incluyendo el punto inicial de cada lado). */
  function sides(i: number) {
    const o = outlineOf(def, i);
    const out: { x: number; y: number }[][] = [];
    let cur = { ...o.start };
    let k = 0;
    for (let s = 0; s < 4; s++) {
      const pts = [cur];
      const n = o.cmds[k].t === "L" ? 1 : 3;
      for (let m = 0; m < n; m++, k++) {
        const c = o.cmds[k];
        if (c.t === "C") pts.push({ x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 });
        pts.push({ x: c.x, y: c.y });
      }
      cur = pts[pts.length - 1];
      out.push(pts);
    }
    return out;
  }

  it("piezas vecinas comparten exactamente el mismo borde (pestaña ↔ muesca)", () => {
    const { cols, rows } = def.spec;
    for (let i = 0; i < def.count; i++) {
      const p = def.pieces[i];
      const mine = sides(i);
      if (p.row < rows - 1) {
        const below = sides(i + cols);
        expect([...mine[2]].reverse()).toEqual(below[0]); // abajo (der→izq) = arriba del vecino al revés
      }
      if (p.col < cols - 1) {
        const right = sides(i + 1);
        expect([...mine[1]].reverse()).toEqual(right[3]); // derecha = izquierda del vecino al revés
      }
    }
  });

  it("las pestañas no sobresalen más del máximo y apuntan a un solo lado", () => {
    const e = generateEdges(8, 8, 1, 7);
    for (let r = 1; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const pts = e.horizontal[r][c];
        const y = r / 8;
        const offs = pts.map((p) => p.y - y);
        const extreme = offs.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);
        expect(Math.abs(extreme)).toBeLessThanOrEqual(MAX_TAB_EXTENT / 8 + 1e-12);
        expect(Math.abs(extreme)).toBeGreaterThan(0.2 / 8); // hay pestaña
      }
    }
  });

  it("la caja de cada pieza cabe en su celda más el margen de pestaña", () => {
    for (let i = 0; i < def.count; i++) {
      const p = def.pieces[i];
      const b = outlineBounds(outlineOf(def, i));
      expect(b.minX).toBeGreaterThanOrEqual(p.col * def.pw - MAX_TAB_EXTENT * def.pw - 1e-9);
      expect(b.maxX).toBeLessThanOrEqual((p.col + 1) * def.pw + MAX_TAB_EXTENT * def.pw + 1e-9);
      expect(b.minY).toBeGreaterThanOrEqual(p.row * def.ph - MAX_TAB_EXTENT * def.ph - 1e-9);
      expect(b.maxY).toBeLessThanOrEqual((p.row + 1) * def.ph + MAX_TAB_EXTENT * def.ph + 1e-9);
    }
  });

  it("es determinista por semilla", () => {
    const a = generateEdges(5, 5, 1, 99);
    const b = generateEdges(5, 5, 1, 99);
    const c = generateEdges(5, 5, 1, 100);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});
