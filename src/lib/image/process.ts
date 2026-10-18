"use client";

import {
  buildExifOrientationSegment,
  injectSegment,
  isJpeg,
  orientationTransform,
  parseJpegInfo,
  swapsDimensions,
} from "./exif";

export const MAX_SIDE = 2048;
/** Límite duro (las reglas también lo imponen). */
export const MAX_BYTES = 10 * 1024 * 1024;
/** Objetivo blando para no gastar cuota de la base de datos. */
export const TARGET_BYTES = 2.5 * 1024 * 1024;
/** Lado máximo al que se decodifica para recortar (ahorra memoria con fotos de 48 MP). */
const WORK_SIDE = 4096;

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
export const ACCEPT_ATTR = ".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif";

export type Drawable = HTMLCanvasElement | ImageBitmap;

export interface WorkImage {
  source: Drawable;
  width: number;
  height: number;
}

export class ImageError extends Error {
  constructor(public code: "type" | "decode" | "size" | "heic") {
    super(code);
  }
}

function isHeic(file: Blob & { name?: string }): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name ?? "");
}

export function isAcceptedFile(file: Blob & { name?: string }): boolean {
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name ?? "");
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

let exifSupport: Promise<boolean> | null = null;

/**
 * ¿El navegador aplica la orientación EXIF al decodificar? Se prueba con un JPEG de 2×1 al que se
 * le inyecta orientación 6 (rotar 90°): si se decodifica como 1×2, la aplica.
 */
export function browserAppliesExif(): Promise<boolean> {
  exifSupport ??= (async () => {
    try {
      const c = canvas(2, 1);
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.9));
      if (!blob) return true;
      const bytes = injectSegment(new Uint8Array(await blob.arrayBuffer()), buildExifOrientationSegment(6));
      const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: "image/jpeg" }), {
        imageOrientation: "from-image",
      });
      const applied = bmp.width === 1 && bmp.height === 2;
      bmp.close();
      return applied;
    } catch {
      return true;
    }
  })();
  return exifSupport;
}

async function decodeHeic(file: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file); // Safari decodifica HEIC de forma nativa
    bmp.close();
    return file;
  } catch {
    try {
      const { default: heic2any } = await import("heic2any");
      const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
      return Array.isArray(out) ? out[0] : out;
    } catch {
      throw new ImageError("heic");
    }
  }
}

function downscaleToCanvas(src: Drawable, w: number, h: number, maxSide: number): HTMLCanvasElement {
  const k = Math.min(1, maxSide / Math.max(w, h));
  const c = canvas(w * k, h * k);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** Decodifica un archivo del usuario (JPG/PNG/WebP/HEIC) con la orientación corregida. */
export async function decodeImageFile(file: File | Blob): Promise<WorkImage> {
  if (!isAcceptedFile(file)) throw new ImageError("type");
  if (file.size > 60 * 1024 * 1024) throw new ImageError("size");
  let blob: Blob = file;
  if (isHeic(file)) blob = await decodeHeic(file);

  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    throw new ImageError("decode");
  }

  let source: Drawable = bmp;
  let width = bmp.width;
  let height = bmp.height;

  const head = new Uint8Array(await blob.slice(0, 256 * 1024).arrayBuffer());
  if (isJpeg(head)) {
    const info = parseJpegInfo(head);
    if (info && info.orientation !== 1 && !(await browserAppliesExif())) {
      const swap = swapsDimensions(info.orientation);
      const c = canvas(swap ? height : width, swap ? width : height);
      const ctx = c.getContext("2d")!;
      ctx.setTransform(...orientationTransform(info.orientation, width, height));
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
      source = c;
      width = c.width;
      height = c.height;
    }
  }

  if (Math.max(width, height) > WORK_SIDE) {
    const c = downscaleToCanvas(source, width, height, WORK_SIDE);
    if (source instanceof ImageBitmap) source.close();
    source = c;
    width = c.width;
    height = c.height;
  }
  return { source, width, height };
}

/** Rasteriza una imagen por URL (p. ej. SVG de la galería) a un canvas de `maxSide`. */
export async function decodeImageUrl(url: string, maxSide = MAX_SIDE): Promise<WorkImage> {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  try {
    await img.decode();
  } catch {
    throw new ImageError("decode");
  }
  const w = img.naturalWidth || 1600;
  const h = img.naturalHeight || 1200;
  const k = maxSide / Math.max(w, h);
  const c = canvas(w * k, h * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return { source: c, width: c.width, height: c.height };
}

export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ExportedImage {
  blob: Blob;
  width: number;
  height: number;
  mime: string;
}

function toBlob(c: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => c.toBlob(resolve, type, quality));
}

/**
 * Recorta, redimensiona (≤ 2048 px por lado) y comprime. Intenta WebP y cae a JPEG si el navegador
 * no lo codifica. Baja calidad y luego tamaño hasta quedar por debajo de `targetBytes`.
 */
export async function exportImage(img: WorkImage, crop: Crop, targetBytes = TARGET_BYTES): Promise<ExportedImage> {
  let side = MAX_SIDE;
  for (let attempt = 0; attempt < 6; attempt++) {
    const k = Math.min(1, side / Math.max(crop.w, crop.h));
    const c = canvas(crop.w * k, crop.h * k);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#f4ece1"; // fondo para PNG con transparencia
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img.source, crop.x, crop.y, crop.w, crop.h, 0, 0, c.width, c.height);
    for (const q of [0.86, 0.78, 0.7]) {
      let blob = await toBlob(c, "image/webp", q);
      if (!blob || blob.type !== "image/webp") blob = await toBlob(c, "image/jpeg", q + 0.02);
      if (!blob) throw new ImageError("decode");
      if (blob.size <= targetBytes || (attempt === 5 && blob.size <= MAX_BYTES)) {
        return { blob, width: c.width, height: c.height, mime: blob.type };
      }
    }
    side = Math.round(side * 0.82);
  }
  throw new ImageError("size");
}

/** Decodifica un blob ya procesado (de la sala o de IndexedDB) para dibujar las piezas. */
export async function blobToBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}
