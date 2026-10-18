import type { GameController } from "@/lib/game/controller";
import type { Vec } from "@/lib/puzzle";
import type { BoardRenderer } from "./BoardRenderer";
import { unlockAudio } from "./sound";

type Mode = "none" | "drag" | "pan" | "pinch";

const EDGE = 36; // px desde el borde donde el tablero se desplaza solo al arrastrar
const EDGE_SPEED = 0.6; // px por ms

/**
 * Ratón y táctil: arrastrar piezas, desplazar el tablero, pellizcar para hacer zoom, rueda,
 * segundo dedo (o clic derecho) para girar mientras se arrastra.
 */
export class BoardInput {
  private pointers = new Map<number, { x: number; y: number }>();
  private mode: Mode = "none";
  private dragPointer = -1;
  private pinchDist = 0;
  private pinchCenter = { x: 0, y: 0 };
  private lastDrag = { x: 0, y: 0 };
  private disposed = false;
  onCursor: ((p: Vec) => void) | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private renderer: BoardRenderer,
    private controller: GameController,
  ) {
    canvas.addEventListener("pointerdown", this.down);
    canvas.addEventListener("pointermove", this.move);
    canvas.addEventListener("pointerup", this.up);
    canvas.addEventListener("pointercancel", this.up);
    canvas.addEventListener("lostpointercapture", this.up);
    canvas.addEventListener("wheel", this.wheel, { passive: false });
    canvas.addEventListener("contextmenu", this.prevent);
    renderer.onFrame = this.frame;
  }

  private pos(e: PointerEvent | WheelEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private prevent = (e: Event) => e.preventDefault();

  private down = (e: PointerEvent) => {
    unlockAudio();
    const p = this.pos(e);
    if (this.mode === "drag") {
      // Segundo dedo o clic derecho mientras se arrastra: girar.
      if (e.pointerType === "touch" || e.button === 2) this.controller.rotate(1);
      return;
    }
    this.pointers.set(e.pointerId, p);
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* algunos navegadores no permiten capturar punteros sintéticos */
    }
    if (this.pointers.size === 1) {
      if (e.button === 2) return;
      const hit = this.renderer.hitTest(p.x, p.y);
      if (hit !== null && this.controller.grab(hit, this.renderer.screenToBoard(p.x, p.y))) {
        this.mode = "drag";
        this.dragPointer = e.pointerId;
        this.lastDrag = p;
        this.canvas.style.cursor = "grabbing";
      } else {
        this.mode = "pan";
      }
    } else if (this.pointers.size === 2) {
      this.startPinch();
    }
  };

  private startPinch() {
    const [a, b] = [...this.pointers.values()];
    this.mode = "pinch";
    this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    this.pinchCenter = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private move = (e: PointerEvent) => {
    const p = this.pos(e);
    this.onCursor?.(this.renderer.screenToBoard(p.x, p.y));
    const prev = this.pointers.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === "mouse" && this.mode === "none") {
        this.canvas.style.cursor = this.renderer.hitTest(p.x, p.y) !== null ? "grab" : "default";
      }
      return;
    }
    this.pointers.set(e.pointerId, p);
    if (this.mode === "drag" && e.pointerId === this.dragPointer) {
      this.lastDrag = p;
      this.controller.dragTo(this.renderer.screenToBoard(p.x, p.y));
    } else if (this.mode === "pan") {
      this.renderer.pan(p.x - prev.x, p.y - prev.y);
    } else if (this.mode === "pinch" && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.renderer.pan(center.x - this.pinchCenter.x, center.y - this.pinchCenter.y);
      this.renderer.zoomAt(center.x, center.y, dist / this.pinchDist);
      this.pinchDist = dist;
      this.pinchCenter = center;
    }
  };

  private up = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.mode === "drag" && e.pointerId === this.dragPointer) {
      this.dragPointer = -1;
      this.mode = "none";
      this.canvas.style.cursor = "grab";
      void this.controller.drop();
    } else if (this.mode === "pinch") {
      this.mode = this.pointers.size === 1 ? "pan" : this.pointers.size >= 2 ? "pinch" : "none";
      if (this.mode === "pinch") this.startPinch();
    } else if (this.pointers.size === 0) {
      this.mode = "none";
    }
    if (this.pointers.size === 0 && this.mode !== "drag") this.mode = "none";
  };

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = this.pos(e);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const speed = e.ctrlKey ? 0.01 : 0.0018; // ctrl+rueda = pellizco del trackpad
    this.renderer.zoomAt(p.x, p.y, Math.exp(-e.deltaY * unit * speed));
    if (this.mode === "drag") this.controller.dragTo(this.renderer.screenToBoard(this.lastDrag.x, this.lastDrag.y));
  };

  private frame = (dt: number) => {
    if (this.mode !== "drag") return;
    const { x, y } = this.lastDrag;
    const w = this.renderer.viewWidth;
    const h = this.renderer.viewHeight;
    let dx = 0;
    let dy = 0;
    if (x < EDGE) dx = 1;
    else if (x > w - EDGE) dx = -1;
    if (y < EDGE) dy = 1;
    else if (y > h - EDGE) dy = -1;
    if (dx || dy) {
      this.renderer.pan(dx * EDGE_SPEED * dt, dy * EDGE_SPEED * dt);
      this.controller.dragTo(this.renderer.screenToBoard(x, y));
    }
  };

  /** Suelta lo que se esté arrastrando (p. ej. al perder la conexión o la pestaña). */
  release() {
    if (this.mode === "drag") {
      this.mode = "none";
      this.dragPointer = -1;
      void this.controller.drop();
    }
    this.pointers.clear();
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.down);
    c.removeEventListener("pointermove", this.move);
    c.removeEventListener("pointerup", this.up);
    c.removeEventListener("pointercancel", this.up);
    c.removeEventListener("lostpointercapture", this.up);
    c.removeEventListener("wheel", this.wheel);
    c.removeEventListener("contextmenu", this.prevent);
    this.renderer.onFrame = null;
  }
}
