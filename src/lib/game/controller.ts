import {
  arrangeLoose,
  normRot,
  rotateAbout,
  rotateVec,
  toLocal,
  toWorld,
  type BoardModel,
  type SortMode,
  type Transform,
  type Vec,
} from "@/lib/puzzle";
import type { BoardRenderer } from "@/lib/render/BoardRenderer";

export interface Merge {
  from: number;
  into: number;
}

/**
 * Puente entre el controlador y la red (o el guardado local). El controlador aplica todo de forma
 * optimista en el modelo; el adaptador decide qué y cuándo enviar.
 */
export interface GameAdapter {
  canInteract(): boolean;
  /** El grupo no está bloqueado por otra persona. */
  isFree(gid: number): boolean;
  /** Toma el grupo (coop: transacción). */
  acquire(gid: number): Promise<boolean>;
  /** Posición durante el arrastre (el adaptador aplica throttling). */
  moving(gid: number, t: Transform): void;
  /** Posición final, fusiones y liberación del bloqueo, en una sola escritura. */
  dropped(gid: number, t: Transform, merges: Merge[]): void;
  /** Se canceló el arrastre sin cambios. */
  released(gid: number, original: Transform): void;
  arranged(changes: Map<number, Transform>): void;
}

export interface ControllerHooks {
  onSnap?(merges: number, at: Vec): void;
  onDrop?(): void;
  onComplete?(): void;
  onDenied?(): void;
}

interface Drag {
  gid: number;
  anchor: Vec;
  pointer: Vec;
  t: Transform;
  original: Transform;
  lock: Promise<boolean>;
}

export class GameController {
  private drag: Drag | null = null;
  selected: number | null = null;
  private unsub: () => void;

  constructor(
    readonly model: BoardModel,
    private renderer: BoardRenderer,
    private adapter: GameAdapter,
    private hooks: ControllerHooks = {},
  ) {
    this.unsub = model.on((e) => {
      if (e.type === "reset") {
        this.drag = null;
        this.selected = null;
      } else if (e.type === "merge" && this.selected === e.from) {
        this.selected = e.into;
      }
    });
  }

  get dragging(): number | null {
    return this.drag?.gid ?? null;
  }

  /** Empieza a arrastrar `gid` desde el punto del tablero `p`. */
  grab(gid: number, p: Vec): boolean {
    if (this.drag || !this.adapter.canInteract()) return false;
    const g = this.model.groups.get(gid);
    if (!g) return false;
    if (!this.adapter.isFree(gid)) {
      this.hooks.onDenied?.();
      return false;
    }
    const t: Transform = { x: g.x, y: g.y, r: g.r };
    this.drag = { gid, anchor: toLocal(t, p), pointer: p, t, original: { ...t }, lock: this.adapter.acquire(gid) };
    this.selected = gid;
    this.renderer.setInstant(gid, true);
    this.renderer.bringToFront(gid);
    this.renderer.setLifted(gid, true);
    const drag = this.drag;
    void drag.lock.then((ok) => {
      if (!ok && this.drag === drag) {
        this.cancel();
        this.hooks.onDenied?.();
      }
    });
    return true;
  }

  dragTo(p: Vec) {
    const d = this.drag;
    if (!d) return;
    d.pointer = p;
    const q = rotateVec(d.anchor, d.t.r);
    d.t = { x: p.x - q.x, y: p.y - q.y, r: d.t.r };
    this.model.setTransform(d.gid, d.t);
    this.adapter.moving(d.gid, d.t);
  }

  /** Gira el grupo que se arrastra (alrededor del dedo) o el seleccionado (alrededor de su centro). */
  rotate(dir: 1 | -1) {
    if (!this.model.def.spec.rotate || !this.adapter.canInteract()) return;
    const d = this.drag;
    if (d) {
      d.t = rotateAbout(d.t, normRot(d.t.r + dir), d.pointer);
      d.anchor = toLocal(d.t, d.pointer);
      this.model.setTransform(d.gid, d.t);
      this.adapter.moving(d.gid, d.t);
      return;
    }
    const gid = this.selected;
    if (gid === null) return;
    const g = this.model.groups.get(gid);
    if (!g) return;
    const center = this.groupCenter(gid);
    if (!this.grab(gid, center)) return;
    this.rotate(dir);
    void this.drop();
  }

  groupCenter(gid: number): Vec {
    const g = this.model.groups.get(gid)!;
    let x = 0;
    let y = 0;
    for (const p of g.members) {
      const piece = this.model.def.pieces[p];
      const w = toWorld(g, { x: piece.cx, y: piece.cy });
      x += w.x;
      y += w.y;
    }
    return { x: x / g.members.length, y: y / g.members.length };
  }

  async drop() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.renderer.setLifted(d.gid, false);
    const ok = await d.lock;
    this.renderer.setInstant(d.gid, false);
    if (!ok || !this.model.groups.has(d.gid)) return;
    const plan = this.model.planDrop(d.gid, d.t, (gid) => gid === d.gid || this.adapter.isFree(gid));
    const root = this.model.applyDrop(d.gid, plan);
    this.adapter.dropped(d.gid, plan.t, plan.merges);
    this.hooks.onDrop?.();
    if (plan.merges.length) {
      this.selected = root;
      this.hooks.onSnap?.(plan.merges.length, this.groupCenterNear(root, d.pointer));
    }
    if (this.model.isComplete()) this.hooks.onComplete?.();
  }

  /** Centro de la pieza del grupo más cercana al punto (para el efecto de encaje). */
  private groupCenterNear(gid: number, p: Vec): Vec {
    const g = this.model.groups.get(gid);
    if (!g) return p;
    let best = p;
    let bestD = Infinity;
    for (const m of g.members) {
      const piece = this.model.def.pieces[m];
      const w = toWorld(g, { x: piece.cx, y: piece.cy });
      const dd = (w.x - p.x) ** 2 + (w.y - p.y) ** 2;
      if (dd < bestD) {
        bestD = dd;
        best = w;
      }
    }
    return best;
  }

  cancel() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.renderer.setLifted(d.gid, false);
    this.renderer.setInstant(d.gid, false);
    if (this.model.groups.has(d.gid)) this.model.setTransform(d.gid, d.original);
    this.adapter.released(d.gid, d.original);
  }

  arrange(mode: SortMode, hue: ArrayLike<number> | null) {
    if (!this.adapter.canInteract()) return;
    const changes = arrangeLoose(this.model, mode, hue, (gid) => gid !== this.drag?.gid && this.adapter.isFree(gid));
    for (const [gid, t] of changes) this.model.setTransform(gid, t);
    this.adapter.arranged(changes);
  }

  destroy() {
    this.cancel();
    this.unsub();
  }
}
