import { Application, CanvasSource, Container, Graphics, Rectangle, Sprite, Text, Texture } from "pixi.js";
import type { BoardEvent, BoardModel } from "@/lib/puzzle";
import type { PieceAtlas } from "./atlas";

interface GroupView {
  id: number;
  c: Container;
  /** transformación mostrada (px del mundo, ángulo en radianes) */
  x: number;
  y: number;
  a: number;
  tx: number;
  ty: number;
  ta: number;
  instant: boolean;
  shadow: Container | null;
}

interface CursorView {
  c: Container;
  x: number;
  y: number;
  tx: number;
  ty: number;
  label: Text;
  color: string;
}

interface Ripple {
  g: Graphics;
  x: number;
  y: number;
  start: number;
}

export interface Camera {
  x: number;
  y: number;
  s: number;
}

export interface ScreenRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const HALF_PI = Math.PI / 2;
/** constante de tiempo de la interpolación de grupos remotos (ms) */
const TAU = 60;
const RIPPLE_MS = 520;

function nearestAngle(current: number, target: number): number {
  const turn = Math.PI * 2;
  return target + Math.round((current - target) / turn) * turn;
}

/**
 * Escena PixiJS del tablero. Observa el `BoardModel`; no conoce la red. Renderiza bajo demanda:
 * solo cuando algo cambió o hay animaciones en curso.
 */
export class BoardRenderer {
  readonly app: Application;
  readonly scale: number;
  readonly cam: Camera = { x: 0, y: 0, s: 1 };
  private world = new Container();
  private layer = new Container();
  private overlay = new Container();
  private ghost: Sprite;
  private reveal: { s: Sprite; start: number } | null = null;
  private frame = new Graphics();
  private views = new Map<number, GroupView>();
  private sprites: Sprite[] = [];
  private pieceTextures: Texture[] = [];
  private pageTextures: Texture[] = [];
  private animating = new Set<number>();
  private cursors = new Map<string, CursorView>();
  private ripples: Ripple[] = [];
  private dirty = true;
  private raf = 0;
  private last = 0;
  private z = 0;
  private edgesOnly = false;
  private hitCtx: CanvasRenderingContext2D;
  private resizeObs: ResizeObserver;
  private unsub: () => void;
  private destroyed = false;
  /** se llama en cada frame (auto-desplazamiento al arrastrar cerca del borde, etc.) */
  onFrame: ((dt: number) => void) | null = null;
  onCameraChange: (() => void) | null = null;

  private constructor(
    app: Application,
    private host: HTMLElement,
    private model: BoardModel,
    private atlas: PieceAtlas,
    ghostSource: HTMLCanvasElement,
  ) {
    this.app = app;
    this.scale = atlas.scale;
    const hit = document.createElement("canvas");
    hit.width = hit.height = 1;
    this.hitCtx = hit.getContext("2d")!;

    app.stage.addChild(this.world);
    this.layer.sortableChildren = true;
    const ghostTex = new Texture({ source: new CanvasSource({ resource: ghostSource, autoGenerateMipmaps: true }) });
    this.ghost = new Sprite(ghostTex);
    this.ghost.width = this.scale;
    this.ghost.height = this.scale * model.def.spec.aspect;
    this.ghost.alpha = 0.2;
    this.ghost.visible = false;
    this.world.addChild(this.ghost, this.frame, this.layer, this.overlay);
    this.drawFrame();

    for (const page of atlas.pages) {
      this.pageTextures.push(
        new Texture({ source: new CanvasSource({ resource: page, autoGenerateMipmaps: true, scaleMode: "linear" }) }),
      );
    }
    for (const slot of atlas.slots) {
      const t = new Texture({
        source: this.pageTextures[slot.page].source,
        frame: new Rectangle(slot.sx, slot.sy, slot.w, slot.h),
      });
      this.pieceTextures.push(t);
      const s = new Sprite(t);
      s.position.set(slot.px, slot.py);
      s.roundPixels = false;
      this.sprites.push(s);
    }
    this.rebuildViews();
    this.unsub = model.on((e) => this.onModel(e));

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    this.raf = requestAnimationFrame(this.tick);
  }

  static async create(
    host: HTMLElement,
    model: BoardModel,
    atlas: PieceAtlas,
    image: CanvasImageSource,
    background: string,
  ): Promise<BoardRenderer> {
    const app = new Application();
    await app.init({
      background,
      antialias: false,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoStart: false,
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
      preference: "webgl",
      powerPreference: "high-performance",
    });
    const canvas = app.canvas as HTMLCanvasElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.touchAction = "none";
    host.appendChild(canvas);
    // Fantasma a menor resolución: basta para guiar y ahorra memoria de GPU.
    const ghost = document.createElement("canvas");
    const gk = Math.min(1, 1024 / atlas.scale);
    ghost.width = Math.round(atlas.scale * gk);
    ghost.height = Math.round(atlas.scale * model.def.spec.aspect * gk);
    ghost.getContext("2d")!.drawImage(image, 0, 0, ghost.width, ghost.height);
    return new BoardRenderer(app, host, model, atlas, ghost);
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas as HTMLCanvasElement;
  }

  private drawFrame() {
    const S = this.scale;
    const h = S * this.model.def.spec.aspect;
    this.frame.clear();
    this.frame.rect(0, 0, S, h).fill({ color: 0x000000, alpha: 0.12 });
    this.frame.rect(0, 0, S, h).stroke({ color: 0xffffff, alpha: 0.3, width: Math.max(3, S * 0.0025) });
  }

  private resize() {
    if (this.destroyed) return;
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.app.renderer.resize(w, h);
    this.markDirty();
  }

  markDirty() {
    this.dirty = true;
  }

  // ---------- vistas de grupos ----------

  private makeView(id: number): GroupView {
    const g = this.model.groups.get(id)!;
    const c = new Container();
    const x = g.x * this.scale;
    const y = g.y * this.scale;
    const a = g.r * HALF_PI;
    c.position.set(x, y);
    c.rotation = a;
    c.zIndex = ++this.z;
    for (const p of g.members) c.addChild(this.sprites[p]);
    c.visible = !this.edgesOnly || g.hasEdge;
    this.layer.addChild(c);
    return { id, c, x, y, a, tx: x, ty: y, ta: a, instant: false, shadow: null };
  }

  private rebuildViews() {
    for (const v of this.views.values()) {
      v.c.removeChildren();
      v.c.destroy();
    }
    this.views.clear();
    this.animating.clear();
    // Grupos más grandes debajo, como en una mesa real.
    const ids = [...this.model.groups.values()].sort((a, b) => b.members.length - a.members.length).map((g) => g.id);
    for (const id of ids) this.views.set(id, this.makeView(id));
    this.markDirty();
  }

  private onModel(e: BoardEvent) {
    if (e.type === "reset") {
      this.reveal = null;
      return this.rebuildViews();
    }
    if (e.type === "move") {
      const g = this.model.groups.get(e.id);
      const v = this.views.get(e.id);
      if (!g || !v) return;
      v.tx = g.x * this.scale;
      v.ty = g.y * this.scale;
      v.ta = nearestAngle(v.a, g.r * HALF_PI);
      if (v.instant) this.applyInstant(v);
      else this.animating.add(v.id);
      if (g.lock && !v.instant) this.bringToFront(e.id);
      this.markDirty();
      return;
    }
    const from = this.views.get(e.from);
    const into = this.views.get(e.into);
    if (!from || !into) return this.rebuildViews();
    this.setLifted(e.from, false);
    for (const s of [...from.c.children]) into.c.addChild(s);
    from.c.destroy();
    this.views.delete(e.from);
    this.animating.delete(e.from);
    const g = this.model.groups.get(e.into);
    if (g) into.c.visible = !this.edgesOnly || g.hasEdge;
    this.markDirty();
  }

  private applyInstant(v: GroupView) {
    v.x = v.tx;
    v.y = v.ty;
    v.a = v.ta;
    v.c.position.set(v.x, v.y);
    v.c.rotation = v.a;
    this.animating.delete(v.id);
  }

  /** Durante un arrastre local el grupo sigue al dedo sin interpolar. */
  setInstant(id: number, instant: boolean) {
    const v = this.views.get(id);
    if (v) v.instant = instant;
  }

  bringToFront(id: number) {
    const v = this.views.get(id);
    if (v && v.c.zIndex !== this.z) {
      v.c.zIndex = ++this.z;
      this.markDirty();
    }
  }

  /** Sombra bajo el grupo que se arrastra (solo grupos pequeños: es barato). */
  setLifted(id: number, lifted: boolean) {
    const v = this.views.get(id);
    if (!v) return;
    if (!lifted) {
      if (v.shadow) {
        v.shadow.destroy({ children: true });
        v.shadow = null;
        this.markDirty();
      }
      return;
    }
    const g = this.model.groups.get(id);
    if (!g || v.shadow || g.members.length > 150) return;
    const shadow = new Container();
    shadow.alpha = 0.3;
    const off = this.scale * 0.006;
    // Desplazamiento abajo-derecha en pantalla, expresado en el marco rotado del grupo.
    const a = -g.r * HALF_PI;
    const dx = off * Math.cos(a) - off * 1.4 * Math.sin(a);
    const dy = off * Math.sin(a) + off * 1.4 * Math.cos(a);
    for (const p of g.members) {
      const s = new Sprite(this.pieceTextures[p]);
      s.tint = 0x1a0f08;
      s.position.set(this.sprites[p].x + dx, this.sprites[p].y + dy);
      shadow.addChild(s);
    }
    v.c.addChildAt(shadow, 0);
    v.shadow = shadow;
    this.markDirty();
  }

  /** Al terminar: funde la imagen limpia (sin cortes) sobre el grupo final. */
  revealImage() {
    if (this.reveal || this.model.groups.size !== 1) return;
    const [g] = this.model.groups.values();
    const v = this.views.get(g.id);
    if (!v) return;
    const s = new Sprite(this.ghost.texture);
    s.width = this.scale;
    s.height = this.scale * this.model.def.spec.aspect;
    s.alpha = 0;
    v.c.addChild(s);
    this.reveal = { s, start: performance.now() + 500 };
    this.markDirty();
  }

  setEdgesOnly(on: boolean) {
    this.edgesOnly = on;
    for (const v of this.views.values()) {
      const g = this.model.groups.get(v.id);
      v.c.visible = !on || !!g?.hasEdge;
    }
    this.markDirty();
  }

  setGhost(on: boolean) {
    this.ghost.visible = on;
    this.markDirty();
  }

  setBackground(color: string) {
    this.app.renderer.background.color = color;
    this.markDirty();
  }

  // ---------- cámara ----------

  setCamera(x: number, y: number, s: number) {
    this.cam.x = x;
    this.cam.y = y;
    this.cam.s = s;
    this.world.position.set(x, y);
    this.world.scale.set(s);
    for (const cur of this.cursors.values()) cur.c.scale.set(1 / s);
    this.markDirty();
    this.onCameraChange?.();
  }

  get viewWidth() {
    return this.host.clientWidth;
  }

  get viewHeight() {
    return this.host.clientHeight;
  }

  /** Ajusta la cámara para que quepa el rectángulo dado (coordenadas normalizadas). */
  fit(b: ScreenRect, padding = 24) {
    const S = this.scale;
    const w = Math.max(1, this.viewWidth - padding * 2);
    const h = Math.max(1, this.viewHeight - padding * 2);
    const s = Math.min(w / ((b.maxX - b.minX) * S), h / ((b.maxY - b.minY) * S));
    const cx = ((b.minX + b.maxX) / 2) * S;
    const cy = ((b.minY + b.maxY) / 2) * S;
    this.setCamera(this.viewWidth / 2 - cx * s, this.viewHeight / 2 - cy * s, s);
  }

  zoomLimits(): { min: number; max: number } {
    const S = this.scale;
    const minView = Math.min(this.viewWidth, this.viewHeight);
    const piece = Math.max(this.model.def.pw, this.model.def.ph) * S;
    return { min: (minView / (S * 4)) * 0.5, max: Math.max((minView * 0.6) / piece, 1) };
  }

  zoomAt(sx: number, sy: number, factor: number) {
    const { min, max } = this.zoomLimits();
    const s = Math.min(max, Math.max(min, this.cam.s * factor));
    const k = s / this.cam.s;
    this.setCamera(sx - (sx - this.cam.x) * k, sy - (sy - this.cam.y) * k, s);
  }

  pan(dx: number, dy: number) {
    this.setCamera(this.cam.x + dx, this.cam.y + dy, this.cam.s);
  }

  /** Pantalla (px CSS relativos al lienzo) → coordenadas normalizadas del tablero. */
  screenToBoard(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.cam.x) / this.cam.s / this.scale, y: (sy - this.cam.y) / this.cam.s / this.scale };
  }

  /** Grupo visible bajo el punto de pantalla (prueba exacta con el contorno de la pieza). */
  hitTest(sx: number, sy: number): number | null {
    const wx = (sx - this.cam.x) / this.cam.s;
    const wy = (sy - this.cam.y) / this.cam.s;
    const def = this.model.def;
    const cw = def.pw * this.scale;
    const ch = def.ph * this.scale;
    const order = [...this.views.values()].filter((v) => v.c.visible).sort((a, b) => b.c.zIndex - a.c.zIndex);
    for (const v of order) {
      const cos = Math.cos(-v.a);
      const sin = Math.sin(-v.a);
      const dx = wx - v.x;
      const dy = wy - v.y;
      const lx = dx * cos - dy * sin;
      const ly = dx * sin + dy * cos;
      const col = Math.floor(lx / cw);
      const row = Math.floor(ly / ch);
      for (let r = row - 1; r <= row + 1; r++) {
        if (r < 0 || r >= def.spec.rows) continue;
        for (let c = col - 1; c <= col + 1; c++) {
          if (c < 0 || c >= def.spec.cols) continue;
          const p = r * def.spec.cols + c;
          if (this.model.rootOfPiece(p) !== v.id) continue;
          if (this.hitCtx.isPointInPath(this.atlas.paths[p], lx, ly)) return v.id;
        }
      }
    }
    return null;
  }

  // ---------- efectos ----------

  ripple(x: number, y: number) {
    const g = new Graphics();
    this.overlay.addChild(g);
    this.ripples.push({ g, x: x * this.scale, y: y * this.scale, start: performance.now() });
    this.markDirty();
  }

  setCursor(uid: string, x: number, y: number, name: string, color: string) {
    let cur = this.cursors.get(uid);
    const wx = x * this.scale;
    const wy = y * this.scale;
    if (!cur) {
      const c = new Container();
      const arrow = new Graphics()
        .poly([0, 0, 0, 18, 4.5, 14, 8, 21, 11, 19.5, 7.5, 12.8, 13, 12.5])
        .fill(color)
        .stroke({ color: 0xffffff, width: 1.5 });
      const label = new Text({
        text: name,
        style: { fontFamily: "system-ui, sans-serif", fontSize: 12, fontWeight: "600", fill: 0xffffff },
      });
      label.position.set(16, 16);
      const bg = new Graphics().roundRect(10, 12, label.width + 12, 22, 11).fill(color);
      c.addChild(arrow, bg, label);
      c.scale.set(1 / this.cam.s);
      c.position.set(wx, wy);
      this.overlay.addChild(c);
      cur = { c, x: wx, y: wy, tx: wx, ty: wy, label, color };
      this.cursors.set(uid, cur);
    }
    cur.tx = wx;
    cur.ty = wy;
    this.markDirty();
  }

  removeCursor(uid: string) {
    const cur = this.cursors.get(uid);
    if (!cur) return;
    cur.c.destroy({ children: true });
    this.cursors.delete(uid);
    this.markDirty();
  }

  // ---------- bucle ----------

  private tick = (now: number) => {
    if (this.destroyed) return;
    const dt = this.last ? Math.min(100, now - this.last) : 16;
    this.last = now;
    this.onFrame?.(dt);
    const k = 1 - Math.exp(-dt / TAU);
    let busy = false;

    for (const id of this.animating) {
      const v = this.views.get(id);
      if (!v) {
        this.animating.delete(id);
        continue;
      }
      v.x += (v.tx - v.x) * k;
      v.y += (v.ty - v.y) * k;
      v.a += (v.ta - v.a) * k;
      if (Math.abs(v.tx - v.x) < 0.3 && Math.abs(v.ty - v.y) < 0.3 && Math.abs(v.ta - v.a) < 0.002) {
        v.x = v.tx;
        v.y = v.ty;
        v.a = v.ta;
        this.animating.delete(id);
      }
      v.c.position.set(v.x, v.y);
      v.c.rotation = v.a;
      busy = true;
    }

    for (const cur of this.cursors.values()) {
      if (Math.abs(cur.tx - cur.x) > 0.2 || Math.abs(cur.ty - cur.y) > 0.2) {
        cur.x += (cur.tx - cur.x) * k;
        cur.y += (cur.ty - cur.y) * k;
        cur.c.position.set(cur.x, cur.y);
        busy = true;
      }
    }

    if (this.ripples.length) {
      busy = true;
      this.ripples = this.ripples.filter((r) => {
        const t = (now - r.start) / RIPPLE_MS;
        if (t >= 1) {
          r.g.destroy();
          return false;
        }
        const e = 1 - (1 - t) ** 3;
        const radius = (8 + e * 46) / this.cam.s;
        r.g.clear().circle(r.x, r.y, radius).stroke({ color: 0xfff3dc, alpha: 0.85 * (1 - t), width: 3 / this.cam.s });
        return true;
      });
    }

    if (this.reveal && this.reveal.s.alpha < 1) {
      const t = Math.max(0, (now - this.reveal.start) / 1400);
      this.reveal.s.alpha = Math.min(1, t * t * (3 - 2 * t));
      busy = true;
    }

    if (this.dirty || busy) {
      this.app.render();
      this.dirty = false;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.unsub();
    for (const t of this.pieceTextures) t.destroy(false);
    for (const t of this.pageTextures) t.destroy(true);
    this.app.destroy({ removeView: true }, { children: true, texture: false });
  }
}
