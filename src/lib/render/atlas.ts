import { MAX_TAB_EXTENT, outlineOf, type Outline, type PuzzleDef } from "@/lib/puzzle";

/** Ubicación de una pieza dentro de una página del atlas. */
export interface PieceSlot {
  page: number;
  /** esquina del slot en la página (px) */
  sx: number;
  sy: number;
  w: number;
  h: number;
  /** esquina del slot en coordenadas del puzzle en px (celda − margen) */
  px: number;
  py: number;
}

export interface PieceAtlas {
  /** px por unidad normalizada (ancho del puzzle en px) */
  scale: number;
  pages: HTMLCanvasElement[];
  slots: PieceSlot[];
  /** contorno en px del puzzle, para hit-test */
  paths: Path2D[];
  /** tono medio de cada pieza (0..360) para ordenar por color */
  hue: Float32Array;
}

export const PAGE_SIZE = 2048;
/** Píxeles totales máximos del atlas (≈ 4 páginas de 2048²) — memoria acotada en móviles. */
const MAX_ATLAS_PIXELS = 4 * PAGE_SIZE * PAGE_SIZE;

export function outlineToPath(o: Outline, s: number, path: Path2D = new Path2D()): Path2D {
  path.moveTo(o.start.x * s, o.start.y * s);
  for (const c of o.cmds) {
    if (c.t === "L") path.lineTo(c.x * s, c.y * s);
    else path.bezierCurveTo(c.x1 * s, c.y1 * s, c.x2 * s, c.y2 * s, c.x * s, c.y * s);
  }
  path.closePath();
  return path;
}

function rgbToHue(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 8) return 400 + (max / 255) * 100; // grises al final, de oscuro a claro
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/**
 * Recorta cada pieza de la imagen con su contorno Bézier y la empaqueta en páginas de 2048×2048.
 * Añade un bisel suave (luz arriba-izquierda, sombra abajo-derecha) y un contorno fino.
 */
export async function buildAtlas(
  def: PuzzleDef,
  image: CanvasImageSource,
  imageWidth: number,
  onProgress?: (fraction: number) => void,
): Promise<PieceAtlas> {
  const { cols, rows, aspect } = def.spec;
  let scale = imageWidth;
  const slotSize = (s: number) => {
    const cw = (s * def.pw);
    const ch = (s * def.ph);
    const pad = Math.ceil(MAX_TAB_EXTENT * Math.max(cw, ch)) + 3;
    return { cw, ch, pad, w: Math.ceil(cw + 2 * pad), h: Math.ceil(ch + 2 * pad) };
  };
  let size = slotSize(scale);
  const total = size.w * size.h * def.count;
  if (total > MAX_ATLAS_PIXELS) {
    scale *= Math.sqrt(MAX_ATLAS_PIXELS / total);
    size = slotSize(scale);
  }
  while (size.w > PAGE_SIZE || size.h > PAGE_SIZE) {
    scale *= 0.9;
    size = slotSize(scale);
  }
  const perRow = Math.floor(PAGE_SIZE / size.w);
  const perCol = Math.floor(PAGE_SIZE / size.h);
  const perPage = perRow * perCol;
  const pageCount = Math.ceil(def.count / perPage);

  const pages: HTMLCanvasElement[] = [];
  for (let p = 0; p < pageCount; p++) {
    const c = document.createElement("canvas");
    const items = Math.min(perPage, def.count - p * perPage);
    c.width = Math.min(PAGE_SIZE, perRow * size.w);
    c.height = Math.ceil(items / perRow) * size.h;
    pages.push(c);
  }

  // Imagen escalada a la resolución del puzzle (una vez), para recortar sin re-muestrear cada pieza.
  const iw = Math.round(scale);
  const ih = Math.round(scale * aspect);
  const src = document.createElement("canvas");
  src.width = iw;
  src.height = ih;
  const sctx = src.getContext("2d")!;
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(image, 0, 0, iw, ih);

  // Color medio por pieza: la imagen reducida a cols×rows.
  const tiny = document.createElement("canvas");
  tiny.width = cols;
  tiny.height = rows;
  const tctx = tiny.getContext("2d", { willReadFrequently: true })!;
  tctx.imageSmoothingQuality = "high";
  tctx.drawImage(src, 0, 0, cols, rows);
  const px = tctx.getImageData(0, 0, cols, rows).data;
  const hue = new Float32Array(def.count);
  for (let i = 0; i < def.count; i++) hue[i] = rgbToHue(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);

  const slots: PieceSlot[] = [];
  const paths: Path2D[] = [];
  const bevel = Math.max(1, Math.min(size.cw, size.ch) * 0.022);
  const ctxs = pages.map((c) => c.getContext("2d")!);
  let lastYield = performance.now();

  for (let i = 0; i < def.count; i++) {
    const piece = def.pieces[i];
    const page = Math.floor(i / perPage);
    const k = i % perPage;
    const sx = (k % perRow) * size.w;
    const sy = Math.floor(k / perRow) * size.h;
    const cellX = piece.col * size.cw;
    const cellY = piece.row * size.ch;
    const slot: PieceSlot = { page, sx, sy, w: size.w, h: size.h, px: cellX - size.pad, py: cellY - size.pad };
    slots.push(slot);

    const path = outlineToPath(outlineOf(def, i), scale);
    paths.push(path);

    const ctx = ctxs[page];
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx, sy, size.w, size.h);
    ctx.clip();
    ctx.translate(sx - slot.px, sy - slot.py); // coordenadas del puzzle en px
    ctx.save();
    ctx.clip(path);
    // Solo la región de la pieza (recortada a los límites de la imagen; Safari falla fuera de rango).
    const rx = Math.max(0, Math.floor(slot.px));
    const ry = Math.max(0, Math.floor(slot.py));
    const rw = Math.min(iw, Math.ceil(slot.px + size.w)) - rx;
    const rh = Math.min(ih, Math.ceil(slot.py + size.h)) - ry;
    if (rw > 0 && rh > 0) ctx.drawImage(src, rx, ry, rw, rh, rx, ry, rw, rh);
    ctx.lineJoin = "round";
    ctx.lineWidth = bevel * 2;
    ctx.translate(bevel, bevel);
    ctx.strokeStyle = "rgba(255,248,235,0.3)";
    ctx.stroke(path);
    ctx.translate(-2 * bevel, -2 * bevel);
    ctx.strokeStyle = "rgba(30,18,10,0.32)";
    ctx.stroke(path);
    ctx.restore();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(30,18,10,0.28)";
    ctx.stroke(path);
    ctx.restore();

    if (performance.now() - lastYield > 24) {
      onProgress?.(i / def.count);
      await nextFrame();
      lastYield = performance.now();
    }
  }
  onProgress?.(1);
  src.width = 0;
  return { scale, pages, slots, paths, hue };
}
