import { describe, expect, it } from "vitest";
import { BoardModel, createPuzzleDef, type BoardEvent, type GroupData } from "../board";
import { rotateAbout, toLocal, toWorld, type Rot } from "../geometry";
import { arrangeLoose, scatter } from "../layout";

const spec = { cols: 4, rows: 3, aspect: 0.75, seed: 5, rotate: false };

function fresh(overrides: Record<number, GroupData> = {}) {
  const def = createPuzzleDef(spec);
  const initial = scatter(def, 1);
  return new BoardModel(def, { ...initial, ...overrides });
}

describe("geometría", () => {
  it("toLocal invierte toWorld para todas las rotaciones", () => {
    for (const r of [0, 1, 2, 3] as Rot[]) {
      const t = { x: 0.3, y: -0.7, r };
      const p = { x: 0.12, y: 0.4 };
      const back = toLocal(t, toWorld(t, p));
      expect(back.x).toBeCloseTo(p.x, 12);
      expect(back.y).toBeCloseTo(p.y, 12);
    }
  });

  it("rotar alrededor de un pivote lo deja fijo", () => {
    const t = { x: 1, y: 2, r: 0 as Rot };
    const pivot = { x: 1.2, y: 2.3 };
    const before = toLocal(t, pivot);
    const t2 = rotateAbout(t, 1, pivot);
    const after = toWorld(t2, before);
    expect(after.x).toBeCloseTo(pivot.x, 12);
    expect(after.y).toBeCloseTo(pivot.y, 12);
    expect(t2.r).toBe(1);
  });
});

describe("BoardModel", () => {
  it("empieza con una pieza por grupo", () => {
    const m = fresh();
    expect(m.groups.size).toBe(12);
    expect(m.placedCount()).toBe(0);
    expect(m.isComplete()).toBe(false);
  });

  it("encaja con un vecino dentro de la tolerancia y no fuera de ella", () => {
    const m = fresh({ 0: { x: 2, y: 2, r: 0 } });
    const tol = m.def.tolerance;
    const near = { x: 2 + tol * 0.6, y: 2 - tol * 0.3, r: 0 as Rot };
    expect(m.snapTargets(1, near)).toEqual([0]);
    const far = { x: 2 + tol * 1.2, y: 2, r: 0 as Rot };
    expect(m.snapTargets(1, far)).toEqual([]);
    // la pieza 5 no es vecina de 0 (diagonal)
    expect(m.snapTargets(5, near)).toEqual([]);
  });

  it("no encaja si la rotación no coincide", () => {
    const m = fresh({ 0: { x: 2, y: 2, r: 1 } });
    expect(m.snapTargets(1, { x: 2, y: 2, r: 0 })).toEqual([]);
    expect(m.snapTargets(1, { x: 2, y: 2, r: 1 })).toEqual([0]);
  });

  it("planDrop fusiona el grupo soltado en el estacionario y adopta su transformación", () => {
    const m = fresh({ 0: { x: 2, y: 2, r: 0 } });
    const plan = m.planDrop(1, { x: 2.001, y: 1.999, r: 0 });
    expect(plan.merges).toEqual([{ from: 1, into: 0 }]);
    expect(plan.t).toEqual({ x: 2, y: 2, r: 0 });
    const events: BoardEvent[] = [];
    m.on((e) => events.push(e));
    expect(m.applyDrop(1, plan)).toBe(0);
    expect(m.groups.size).toBe(11);
    expect(m.groupOfPiece(1).id).toBe(0);
    expect(m.groupOfPiece(1).members.sort()).toEqual([0, 1]);
    expect(m.placedCount()).toBe(2);
    expect(events.map((e) => e.type)).toEqual(["move", "merge"]);
    expect(m.getRaw(1)?.m).toBe(0);
  });

  it("al rellenar un hueco fusiona también los otros vecinos alineados", () => {
    // 0 y 2 ya están en la misma traslación pero no son vecinos; 1 está entre ambos.
    const m = fresh({ 0: { x: 3, y: 3, r: 0 }, 2: { x: 3, y: 3, r: 0 } });
    const plan = m.planDrop(1, { x: 3, y: 3, r: 0 });
    expect(plan.merges).toHaveLength(2);
    m.applyDrop(1, plan);
    expect(m.groupOfPiece(0).id).toBe(m.groupOfPiece(2).id);
    expect(m.groupOfPiece(1).members).toHaveLength(3);
  });

  it("respeta grupos bloqueados por otra persona", () => {
    const m = fresh({ 0: { x: 2, y: 2, r: 0 } });
    const plan = m.planDrop(1, { x: 2, y: 2, r: 0 }, (gid) => gid !== 0);
    expect(plan.merges).toEqual([]);
  });

  it("encaja con el marco cerca de la posición final", () => {
    const m = fresh();
    const plan = m.planDrop(5, { x: m.def.tolerance / 3, y: 0, r: 0 });
    expect(plan.framed).toBe(true);
    expect(plan.t).toEqual({ x: 0, y: 0, r: 0 });
    const rotated = m.planDrop(5, { x: 0, y: 0, r: 2 });
    expect(rotated.framed).toBe(false);
  });

  it("detecta la victoria al completar todas las uniones", () => {
    const m = fresh();
    const order = [...Array(12).keys()];
    // Mueve cada pieza a la transformación de la pieza 0 y suéltala.
    const t0 = m.groupOfPiece(0);
    const target = { x: t0.x, y: t0.y, r: t0.r };
    let merges = 0;
    for (const p of order.slice(1)) {
      const root = m.rootOfPiece(p);
      const plan = m.planDrop(root, target);
      merges += plan.merges.length;
      m.applyDrop(root, plan);
    }
    expect(m.isComplete()).toBe(true);
    expect(merges).toBe(11);
    expect(m.placedCount()).toBe(12);
  });

  it("aplica fusiones remotas encadenadas (union-find)", () => {
    const m = fresh();
    m.applyRemote(1, { x: 0, y: 0, r: 0, m: 0 });
    m.applyRemote(2, { x: 0, y: 0, r: 0, m: 1 }); // apunta a un grupo ya fusionado → raíz 0
    expect(m.groupOfPiece(2).id).toBe(0);
    expect(m.groupOfPiece(0).members.sort()).toEqual([0, 1, 2]);
    m.applyRemote(0, { x: 0.5, y: 0.25, r: 2 });
    expect(m.groupOfPiece(2)).toMatchObject({ x: 0.5, y: 0.25, r: 2 });
  });

  it("se reconstruye si el servidor revierte una fusión optimista", () => {
    const m = fresh({ 0: { x: 2, y: 2, r: 0 } });
    m.applyDrop(1, m.planDrop(1, { x: 2, y: 2, r: 0 }));
    expect(m.groups.size).toBe(11);
    const events: string[] = [];
    m.on((e) => events.push(e.type));
    m.applyRemote(1, { x: 5, y: 5, r: 0 }); // el servidor dice: 1 no está fusionado
    expect(events).toContain("reset");
    expect(m.groups.size).toBe(12);
    expect(m.groupOfPiece(1)).toMatchObject({ id: 1, x: 5, y: 5 });
  });

  it("ignora ciclos de fusión sin colgarse", () => {
    const def = createPuzzleDef(spec);
    const init = scatter(def, 3);
    init[0] = { ...init[0], m: 1 };
    init[1] = { ...init[1], m: 0 };
    const m = new BoardModel(def, init);
    expect(m.groups.size).toBeGreaterThanOrEqual(11);
    expect(() => m.find(0)).not.toThrow();
  });

  it("serializa y recarga el mismo estado", () => {
    const m = fresh({ 0: { x: 2, y: 2, r: 0 } });
    m.applyDrop(1, m.planDrop(1, { x: 2, y: 2, r: 0 }));
    const copy = new BoardModel(m.def, m.serialize());
    expect(copy.groups.size).toBe(11);
    expect(copy.groupOfPiece(1).id).toBe(0);
  });
});

describe("layout", () => {
  it("la dispersión es determinista y deja libre el marco", () => {
    const def = createPuzzleDef({ cols: 10, rows: 8, aspect: 0.8, seed: 9, rotate: true });
    const a = scatter(def, 77);
    expect(scatter(def, 77)).toEqual(a);
    expect(scatter(def, 78)).not.toEqual(a);
    const m = new BoardModel(def, a);
    const centers = new Set<string>();
    let rotated = 0;
    for (const g of m.groups.values()) {
      const p = def.pieces[g.members[0]];
      const c = toWorld(g, { x: p.cx, y: p.cy });
      const inFrame = c.x > 0 && c.x < 1 && c.y > 0 && c.y < 0.8;
      expect(inFrame).toBe(false);
      centers.add(`${Math.round(c.x * 50)},${Math.round(c.y * 50)}`);
      if (g.r !== 0) rotated++;
    }
    expect(centers.size).toBeGreaterThan(def.count * 0.9);
    expect(rotated).toBeGreaterThan(0);
  });

  it("sin rotación todas las piezas quedan derechas", () => {
    const def = createPuzzleDef(spec);
    expect(Object.values(scatter(def, 2)).every((g) => g.r === 0)).toBe(true);
  });

  it("ordenar pone bordes primero y solo mueve piezas sueltas libres", () => {
    const m = fresh({ 0: { x: 2, y: 2, r: 0 } });
    m.applyDrop(1, m.planDrop(1, { x: 2, y: 2, r: 0 }));
    const arranged = arrangeLoose(m, "edges", null, (gid) => gid !== 11);
    expect(arranged.has(0)).toBe(false); // grupo de 2
    expect(arranged.has(11)).toBe(false); // bloqueado
    const ids = [...arranged.keys()];
    const firstInterior = ids.findIndex((id) => !m.def.pieces[id].edge);
    const lastEdge = ids.length - 1 - [...ids].reverse().findIndex((id) => m.def.pieces[id].edge);
    if (firstInterior >= 0) expect(lastEdge).toBeLessThan(firstInterior);
    for (const t of arranged.values()) expect(t.y).toBeGreaterThan(0);
  });
});
