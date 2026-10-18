import { rotateVec, type Rot, type Transform } from "./geometry";
import type { BoardModel, GroupData, PuzzleDef } from "./board";
import { mulberry32, shuffle } from "./rng";

/** Lado de la celda de dispersión, en múltiplos del lado mayor de pieza (incluye pestañas). */
const CELL = 1.45;

export function transformForCenter(def: PuzzleDef, piece: number, center: { x: number; y: number }, r: Rot): Transform {
  const p = def.pieces[piece];
  const q = rotateVec({ x: p.cx, y: p.cy }, r);
  return { x: center.x - q.x, y: center.y - q.y, r };
}

/**
 * Dispersión inicial determinista: cada pieza en una celda distinta alrededor del marco (que queda
 * libre). Misma semilla → mismo tablero (versus justo).
 */
export function scatter(def: PuzzleDef, seed: number): Record<number, GroupData> {
  const rand = mulberry32(seed ^ 0x51ed270b);
  const { aspect, rotate } = def.spec;
  const s = Math.max(def.pw, def.ph) * CELL;
  const gap = s * 0.4;
  const n = def.count;
  let margin = s * 2;
  let cells: { x: number; y: number }[] = [];
  for (let attempt = 0; attempt < 60; attempt++) {
    cells = [];
    const x0 = -margin;
    const y0 = -margin;
    const nx = Math.floor((1 + 2 * margin) / s);
    const ny = Math.floor((aspect + 2 * margin) / s);
    const offX = (1 + 2 * margin - nx * s) / 2;
    const offY = (aspect + 2 * margin - ny * s) / 2;
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const cx = x0 + offX + (ix + 0.5) * s;
        const cy = y0 + offY + (iy + 0.5) * s;
        const inside = cx + s / 2 > -gap && cx - s / 2 < 1 + gap && cy + s / 2 > -gap && cy - s / 2 < aspect + gap;
        if (!inside) cells.push({ x: cx, y: cy });
      }
    }
    if (cells.length >= n * 1.1) break;
    margin += s;
  }
  shuffle(cells, rand);
  const out: Record<number, GroupData> = {};
  for (let i = 0; i < n; i++) {
    const c = cells[i % cells.length];
    const jitter = s * 0.12;
    const center = { x: c.x + (rand() * 2 - 1) * jitter, y: c.y + (rand() * 2 - 1) * jitter };
    const r = (rotate ? Math.floor(rand() * 4) : 0) as Rot;
    const t = transformForCenter(def, i, center, r);
    out[i] = { x: t.x, y: t.y, r };
  }
  return out;
}

export type SortMode = "edges" | "color";

/**
 * Ordena las piezas sueltas (grupos de una sola pieza) en una cuadrícula debajo del marco.
 * `edges`: esquinas, luego bordes, luego interiores. `color`: por tono (`hue[piece]` en 0..360),
 * con los bordes primero dentro de la misma lógica.
 */
export function arrangeLoose(
  model: BoardModel,
  mode: SortMode,
  hue: ArrayLike<number> | null,
  isFree: (gid: number) => boolean = () => true,
): Map<number, Transform> {
  const def = model.def;
  const loose = [...model.groups.values()].filter((g) => g.members.length === 1 && isFree(g.id));
  const rank = (piece: number) => (def.pieces[piece].corner ? 0 : def.pieces[piece].edge ? 1 : 2);
  loose.sort((a, b) => {
    const pa = a.members[0];
    const pb = b.members[0];
    if (mode === "edges" || !hue) return rank(pa) - rank(pb) || pa - pb;
    const ea = def.pieces[pa].edge ? 0 : 1;
    const eb = def.pieces[pb].edge ? 0 : 1;
    return ea - eb || hue[pa] - hue[pb] || pa - pb;
  });
  const s = Math.max(def.pw, def.ph) * CELL;
  const width = Math.max(1, Math.sqrt(loose.length) * s * 1.6);
  const perRow = Math.max(1, Math.floor(width / s));
  const top = def.spec.aspect + s;
  const out = new Map<number, Transform>();
  loose.forEach((g, k) => {
    const center = { x: (k % perRow + 0.5) * s, y: top + (Math.floor(k / perRow) + 0.5) * s };
    out.set(g.id, transformForCenter(def, g.members[0], center, g.r));
  });
  return out;
}

/** Caja envolvente de todas las piezas (para ajustar la cámara). */
export function boardBounds(model: BoardModel): { minX: number; minY: number; maxX: number; maxY: number } {
  const def = model.def;
  const pad = Math.max(def.pw, def.ph);
  let minX = 0;
  let minY = 0;
  let maxX = 1;
  let maxY = def.spec.aspect;
  for (const g of model.groups.values()) {
    for (const p of g.members) {
      const q = rotateVec({ x: def.pieces[p].cx, y: def.pieces[p].cy }, g.r);
      const x = q.x + g.x;
      const y = q.y + g.y;
      if (x - pad < minX) minX = x - pad;
      if (y - pad < minY) minY = y - pad;
      if (x + pad > maxX) maxX = x + pad;
      if (y + pad > maxY) maxY = y + pad;
    }
  }
  return { minX, minY, maxX, maxY };
}
