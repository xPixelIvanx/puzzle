import { normRot, type Rot, type Transform } from "./geometry";
import type { Lock } from "./locks";
import { generateEdges, pieceOutline, type EdgeSet, type Outline } from "./shapes";

export interface PuzzleSpec {
  cols: number;
  rows: number;
  /** alto / ancho de la imagen */
  aspect: number;
  seed: number;
  rotate: boolean;
}

export interface PieceInfo {
  index: number;
  col: number;
  row: number;
  /** centro de la pieza en el marco del puzzle */
  cx: number;
  cy: number;
  edge: boolean;
  corner: boolean;
  neighbors: number[];
}

export interface PuzzleDef {
  spec: PuzzleSpec;
  count: number;
  pw: number;
  ph: number;
  pieces: PieceInfo[];
  edges: EdgeSet;
  /** distancia máxima (normalizada) para encajar */
  tolerance: number;
}

/** Fracción del lado menor de pieza dentro de la cual dos piezas encajan. */
export const SNAP_FACTOR = 0.3;

export function createPuzzleDef(spec: PuzzleSpec): PuzzleDef {
  const { cols, rows, aspect } = spec;
  const pw = 1 / cols;
  const ph = aspect / rows;
  const pieces: PieceInfo[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const index = row * cols + col;
      const neighbors: number[] = [];
      if (row > 0) neighbors.push(index - cols);
      if (col < cols - 1) neighbors.push(index + 1);
      if (row < rows - 1) neighbors.push(index + cols);
      if (col > 0) neighbors.push(index - 1);
      const borderSides = Number(row === 0) + Number(row === rows - 1) + Number(col === 0) + Number(col === cols - 1);
      pieces.push({
        index,
        col,
        row,
        cx: (col + 0.5) * pw,
        cy: (row + 0.5) * ph,
        edge: borderSides > 0,
        corner: borderSides >= 2,
        neighbors,
      });
    }
  }
  return {
    spec,
    count: cols * rows,
    pw,
    ph,
    pieces,
    edges: generateEdges(cols, rows, aspect, spec.seed),
    tolerance: SNAP_FACTOR * Math.min(pw, ph),
  };
}

export function outlineOf(def: PuzzleDef, index: number): Outline {
  const p = def.pieces[index];
  return pieceOutline(def.edges, p.col, p.row, def.spec.aspect);
}

/** Estado crudo de un grupo tal como se guarda (ids numéricos; la red usa "g{id}"). */
export interface GroupData {
  x: number;
  y: number;
  r: Rot;
  l?: Lock | null;
  /** fusionado en el grupo con este id */
  m?: number;
}

export interface Group extends Transform {
  id: number;
  members: number[];
  lock: Lock | null;
  hasEdge: boolean;
}

export type BoardEvent =
  | { type: "reset" }
  | { type: "move"; id: number }
  | { type: "merge"; from: number; into: number };

export interface DropPlan {
  /** transformación final del grupo soltado (antes de fusionarse) */
  t: Transform;
  /** fusiones a aplicar, en orden */
  merges: { from: number; into: number }[];
  /** se fijó a su posición final en el marco */
  framed: boolean;
}

/**
 * Modelo del tablero. Los grupos forman un union-find: cada id de grupo es el índice de la pieza que
 * lo fundó; un grupo fusionado guarda `m` (destino). Las raíces tienen transformación y miembros.
 * Mantiene una copia "cruda" (`raw`) que refleja exactamente lo guardado, y la usa para reconstruirse
 * si llega un cambio remoto inconsistente con el estado optimista local.
 */
export class BoardModel {
  readonly def: PuzzleDef;
  readonly groups = new Map<number, Group>();
  private raw: (GroupData | undefined)[];
  private rootCache: Int32Array;
  private listeners = new Set<(e: BoardEvent) => void>();

  constructor(def: PuzzleDef, initial: Record<number, GroupData> | (GroupData | undefined)[]) {
    this.def = def;
    this.raw = new Array(def.count);
    this.rootCache = new Int32Array(def.count);
    for (let i = 0; i < def.count; i++) this.raw[i] = (initial as Record<number, GroupData>)[i];
    this.rebuild(false);
  }

  on(listener: (e: BoardEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(e: BoardEvent) {
    for (const l of this.listeners) l(e);
  }

  /** Raíz del grupo `id` siguiendo punteros de fusión (seguro ante ciclos). */
  find(id: number): number {
    let cur = id;
    for (let steps = 0; steps <= this.def.count; steps++) {
      const d = this.raw[cur];
      if (!d || d.m === undefined || d.m === null) return cur;
      if (d.m < 0 || d.m >= this.def.count || d.m === cur) return cur;
      cur = d.m;
    }
    return id; // ciclo: tratar como raíz propia
  }

  rootOfPiece(piece: number): number {
    return this.rootCache[piece];
  }

  groupOfPiece(piece: number): Group {
    return this.groups.get(this.rootCache[piece])!;
  }

  getRaw(id: number): GroupData | undefined {
    return this.raw[id];
  }

  /** Reconstruye grupos desde `raw`. */
  rebuild(emit = true) {
    this.groups.clear();
    const { count, pieces } = this.def;
    for (let i = 0; i < count; i++) {
      let root = this.find(i);
      const d = this.raw[root];
      if (!d || d.m !== undefined && d.m !== null) root = i; // ciclo o dato faltante
      this.rootCache[i] = root;
      let g = this.groups.get(root);
      if (!g) {
        const rd = this.raw[root];
        g = {
          id: root,
          x: rd?.x ?? 0,
          y: rd?.y ?? 0,
          r: normRot(rd?.r ?? 0),
          members: [],
          lock: rd?.l ?? null,
          hasEdge: false,
        };
        this.groups.set(root, g);
      }
      g.members.push(i);
      if (pieces[i].edge) g.hasEdge = true;
    }
    if (emit) this.emit({ type: "reset" });
  }

  /** Reemplaza todo el estado (p. ej. carga inicial). */
  load(all: Record<number, GroupData> | (GroupData | undefined)[]) {
    for (let i = 0; i < this.def.count; i++) this.raw[i] = (all as Record<number, GroupData>)[i];
    this.rebuild();
  }

  setTransform(id: number, t: Transform) {
    const g = this.groups.get(id);
    if (!g) return;
    g.x = t.x;
    g.y = t.y;
    g.r = t.r;
    const d = this.raw[id];
    this.raw[id] = { ...d, x: t.x, y: t.y, r: t.r };
    this.emit({ type: "move", id });
  }

  setLock(id: number, lock: Lock | null) {
    const g = this.groups.get(id);
    if (!g) return;
    g.lock = lock;
    const d = this.raw[id];
    if (d) this.raw[id] = { ...d, l: lock };
    this.emit({ type: "move", id });
  }

  /** Fusiona la raíz `from` en la raíz `into`: las piezas de `from` adoptan la transformación de `into`. */
  merge(from: number, into: number): boolean {
    const a = this.groups.get(from);
    const b = this.groups.get(into);
    if (!a || !b || from === into) return false;
    this.raw[from] = { x: b.x, y: b.y, r: b.r, m: into };
    for (const p of a.members) {
      b.members.push(p);
      this.rootCache[p] = into;
    }
    if (a.hasEdge) b.hasEdge = true;
    this.groups.delete(from);
    this.emit({ type: "merge", from, into });
    return true;
  }

  /** Aplica un cambio recibido de la red para el grupo `id`. */
  applyRemote(id: number, data: GroupData | null) {
    if (id < 0 || id >= this.def.count) return;
    const prev = this.raw[id];
    this.raw[id] = data ?? undefined;
    if (!data) return this.rebuild();
    const isRoot = this.groups.has(id);
    if (data.m !== undefined && data.m !== null) {
      if (prev?.m === data.m) return;
      if (!isRoot) return this.rebuild();
      const into = this.find(data.m);
      if (into === id || !this.groups.has(into)) return this.rebuild();
      // Restaurar raw tras merge(), que lo sobrescribe con la transformación del destino.
      this.merge(id, into);
      this.raw[id] = data;
      return;
    }
    if (!isRoot) return this.rebuild();
    const g = this.groups.get(id)!;
    g.x = data.x;
    g.y = data.y;
    g.r = normRot(data.r);
    g.lock = data.l ?? null;
    this.emit({ type: "move", id });
  }

  /** Raíces vecinas con la misma rotación cuya traslación coincide dentro de la tolerancia. */
  snapTargets(id: number, t: Transform, isFree: (gid: number) => boolean = () => true): number[] {
    const g = this.groups.get(id);
    if (!g) return [];
    const tol = this.def.tolerance;
    const out: number[] = [];
    const seen = new Set<number>([id]);
    for (const p of g.members) {
      for (const n of this.def.pieces[p].neighbors) {
        const rn = this.rootCache[n];
        if (seen.has(rn)) continue;
        seen.add(rn);
        const h = this.groups.get(rn);
        if (!h || h.r !== t.r || !isFree(rn)) continue;
        if (Math.hypot(h.x - t.x, h.y - t.y) < tol) out.push(rn);
      }
    }
    return out;
  }

  /**
   * Calcula qué pasa al soltar el grupo `id` en `t`: encaje con el marco y fusiones con vecinos.
   * El grupo soltado se fusiona en el destino más grande (estacionario); otros vecinos que también
   * coincidan con ese destino se fusionan en él.
   */
  planDrop(id: number, t: Transform, isFree: (gid: number) => boolean = () => true): DropPlan {
    const tol = this.def.tolerance;
    let final: Transform = { ...t };
    let framed = false;
    if (final.r === 0 && Math.hypot(final.x, final.y) < tol) {
      final = { x: 0, y: 0, r: 0 };
      framed = true;
    }
    const targets = this.snapTargets(id, final, isFree);
    if (targets.length === 0) return { t: final, merges: [], framed };
    targets.sort((a, b) => this.groups.get(b)!.members.length - this.groups.get(a)!.members.length || a - b);
    const into = targets[0];
    const dest = this.groups.get(into)!;
    const merges = [{ from: id, into }];
    for (const k of targets.slice(1)) {
      const h = this.groups.get(k)!;
      if (Math.hypot(h.x - dest.x, h.y - dest.y) < tol) merges.push({ from: k, into });
    }
    return { t: { x: dest.x, y: dest.y, r: dest.r }, merges, framed: framed || (dest.x === 0 && dest.y === 0 && dest.r === 0) };
  }

  /** Aplica un plan localmente. Devuelve la raíz resultante. */
  applyDrop(id: number, plan: DropPlan): number {
    this.setTransform(id, plan.t);
    let root = id;
    for (const { from, into } of plan.merges) {
      if (this.merge(from, into)) root = into;
    }
    return root;
  }

  isComplete(): boolean {
    return this.groups.size === 1;
  }

  /** Piezas que forman parte de un grupo de 2 o más. */
  placedCount(): number {
    let n = 0;
    for (const g of this.groups.values()) if (g.members.length > 1) n += g.members.length;
    return n;
  }

  /** Estado crudo serializable (sin bloqueos). */
  serialize(): Record<number, GroupData> {
    const out: Record<number, GroupData> = {};
    for (let i = 0; i < this.def.count; i++) {
      const d = this.raw[i];
      if (!d) continue;
      out[i] = d.m !== undefined && d.m !== null ? { x: d.x, y: d.y, r: d.r, m: d.m } : { x: d.x, y: d.y, r: d.r };
    }
    return out;
  }
}
