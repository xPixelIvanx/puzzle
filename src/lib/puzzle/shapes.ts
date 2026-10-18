import type { Vec } from "./geometry";
import { mulberry32 } from "./rng";

/** Comando de contorno en coordenadas normalizadas del marco del puzzle. */
export type PathCmd =
  | { t: "L"; x: number; y: number }
  | { t: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number };

export interface Outline {
  start: Vec;
  cmds: PathCmd[];
}

/** Un borde interior: 10 puntos de control (3 Bézier cúbicas encadenadas) del inicio al final. */
export type EdgePoints = Vec[];

export interface EdgeSet {
  cols: number;
  rows: number;
  /** horizontal[r][c]: borde en y = r·ph entre las piezas (r-1, c) y (r, c); r = 1..rows-1. */
  horizontal: EdgePoints[][];
  /** vertical[r][c]: borde en x = c·pw entre las piezas (r, c-1) y (r, c); c = 1..cols-1. */
  vertical: EdgePoints[][];
}

/** Tamaño de pestaña (fracción del lado) y variación aleatoria. */
export const TAB_SIZE = 0.1;
export const JITTER = 0.04;
/** Lo máximo que una pestaña sobresale del lado, como fracción de la dimensión perpendicular. */
export const MAX_TAB_EXTENT = 3 * TAB_SIZE + JITTER;

/**
 * Genera todos los bordes interiores (algoritmo inspirado en el generador de Draradech):
 * cada borde son 3 curvas Bézier que forman cuello y cabeza de la pestaña, con pequeñas variaciones.
 * Los bordes de una misma línea comparten tangentes en las esquinas (a ↔ e) para que no haya picos.
 */
export function generateEdges(cols: number, rows: number, aspect: number, seed: number): EdgeSet {
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const uniform = (min: number, max: number) => min + rand() * (max - min);
  const pw = 1 / cols;
  const ph = aspect / rows;
  const t = TAB_SIZE;
  const j = JITTER;

  // Una "línea" de bordes consecutivos (por ejemplo, toda la fila r de bordes horizontales).
  const line = (
    count: number,
    along: number,
    across: number,
    point: (k: number, u: number, v: number) => Vec,
  ): EdgePoints[] => {
    const out: EdgePoints[] = [];
    let flip = false;
    let e = uniform(-j, j);
    for (let k = 0; k < count; k++) {
      const flipOld = flip;
      flip = rand() < 0.5;
      const a = flip === flipOld ? -e : e;
      const b = uniform(-j, j);
      const c = uniform(-j, j);
      const d = uniform(-j, j);
      e = uniform(-j, j);
      const s = flip ? -1 : 1;
      const P = (u: number, v: number) => point(k, u * along, v * across * s);
      out.push([
        P(0, 0),
        P(0.2, a),
        P(0.5 + b + d, -t + c),
        P(0.5 - t + b, t + c),
        P(0.5 - 2 * t + b - d, 3 * t + c),
        P(0.5 + 2 * t + b - d, 3 * t + c),
        P(0.5 + t + b, t + c),
        P(0.5 + b + d, -t + c),
        P(0.8, e),
        P(1, 0),
      ]);
    }
    return out;
  };

  const horizontal: EdgePoints[][] = [];
  for (let r = 0; r < rows; r++) {
    horizontal.push(r === 0 ? [] : line(cols, pw, ph, (k, u, v) => ({ x: k * pw + u, y: r * ph + v })));
  }
  const vertical: EdgePoints[][] = Array.from({ length: rows }, () => [] as EdgePoints[]);
  for (let c = 1; c < cols; c++) {
    const edges = line(rows, ph, pw, (k, u, v) => ({ x: c * pw + v, y: k * ph + u }));
    for (let r = 0; r < rows; r++) vertical[r][c] = edges[r];
  }
  return { cols, rows, horizontal, vertical };
}

function pushEdge(cmds: PathCmd[], pts: EdgePoints, reverse: boolean) {
  const p = reverse ? [...pts].reverse() : pts;
  for (let i = 1; i < p.length; i += 3) {
    cmds.push({ t: "C", x1: p[i].x, y1: p[i].y, x2: p[i + 1].x, y2: p[i + 1].y, x: p[i + 2].x, y: p[i + 2].y });
  }
}

/** Contorno cerrado de la pieza (col, row) en sentido horario: arriba, derecha, abajo, izquierda. */
export function pieceOutline(edges: EdgeSet, col: number, row: number, aspect: number): Outline {
  const { cols, rows } = edges;
  const pw = 1 / cols;
  const ph = aspect / rows;
  const x0 = col * pw;
  const y0 = row * ph;
  const x1 = x0 + pw;
  const y1 = y0 + ph;
  const cmds: PathCmd[] = [];
  if (row === 0) cmds.push({ t: "L", x: x1, y: y0 });
  else pushEdge(cmds, edges.horizontal[row][col], false);
  if (col === cols - 1) cmds.push({ t: "L", x: x1, y: y1 });
  else pushEdge(cmds, edges.vertical[row][col + 1], false);
  if (row === rows - 1) cmds.push({ t: "L", x: x0, y: y1 });
  else pushEdge(cmds, edges.horizontal[row + 1][col], true);
  if (col === 0) cmds.push({ t: "L", x: x0, y: y0 });
  else pushEdge(cmds, edges.vertical[row][col], true);
  return { start: { x: x0, y: y0 }, cmds };
}

/** Caja envolvente aproximada (por puntos de control, que contienen a la curva). */
export function outlineBounds(o: Outline): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = o.start.x;
  let minY = o.start.y;
  let maxX = minX;
  let maxY = minY;
  const add = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const c of o.cmds) {
    if (c.t === "C") {
      add(c.x1, c.y1);
      add(c.x2, c.y2);
    }
    add(c.x, c.y);
  }
  return { minX, minY, maxX, maxY };
}
