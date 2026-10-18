/** Lectura mínima de JPEG: orientación EXIF y dimensiones crudas (marcador SOF). Sin dependencias. */
export interface JpegInfo {
  orientation: number; // 1..8 (1 = normal)
  width: number;
  height: number;
}

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function readOrientation(view: DataView, start: number, length: number): number {
  // "Exif\0\0"
  if (view.getUint32(start) !== 0x45786966 || view.getUint16(start + 4) !== 0) return 1;
  const tiff = start + 6;
  const order = view.getUint16(tiff);
  const little = order === 0x4949;
  if (!little && order !== 0x4d4d) return 1;
  if (view.getUint16(tiff + 2, little) !== 0x002a) return 1;
  const ifd = tiff + view.getUint32(tiff + 4, little);
  if (ifd + 2 > start + length) return 1;
  const entries = view.getUint16(ifd, little);
  for (let i = 0; i < entries; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > view.byteLength) break;
    if (view.getUint16(entry, little) === 0x0112) {
      const value = view.getUint16(entry + 8, little);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

export function parseJpegInfo(bytes: Uint8Array): JpegInfo | null {
  if (!isJpeg(bytes)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let orientation = 1;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break; // fin o inicio de datos de imagen
    const length = view.getUint16(offset + 2);
    if (length < 2) return null;
    const segStart = offset + 4;
    if (marker === 0xe1 && segStart + 6 <= bytes.length) {
      try {
        orientation = readOrientation(view, segStart, length - 2);
      } catch {
        orientation = 1;
      }
    }
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof && segStart + 5 <= bytes.length) {
      return { orientation, height: view.getUint16(segStart + 1), width: view.getUint16(segStart + 3) };
    }
    offset += 2 + length;
  }
  return null;
}

/** Segmento APP1 con solo la etiqueta de orientación (para detectar si el navegador aplica EXIF). */
export function buildExifOrientationSegment(orientation: number): Uint8Array {
  const tiff = [
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // MM, 42, offset IFD0 = 8
    0x00, 0x01, // 1 entrada
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, // orientación, SHORT, cuenta 1
    0x00, orientation & 0xff, 0x00, 0x00, // valor
    0x00, 0x00, 0x00, 0x00, // sin siguiente IFD
  ];
  const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const length = payload.length + 2;
  return new Uint8Array([0xff, 0xe1, length >> 8, length & 0xff, ...payload]);
}

/** Inserta un segmento justo después de SOI. */
export function injectSegment(jpeg: Uint8Array, segment: Uint8Array): Uint8Array {
  const out = new Uint8Array(jpeg.length + segment.length);
  out.set(jpeg.subarray(0, 2), 0);
  out.set(segment, 2);
  out.set(jpeg.subarray(2), 2 + segment.length);
  return out;
}

/** ¿La orientación intercambia ancho y alto? */
export function swapsDimensions(orientation: number): boolean {
  return orientation >= 5 && orientation <= 8;
}

/** Matriz de canvas (a, b, c, d, e, f) para dibujar una imagen cruda w×h corrigiendo la orientación. */
export function orientationTransform(orientation: number, w: number, h: number): [number, number, number, number, number, number] {
  switch (orientation) {
    case 2:
      return [-1, 0, 0, 1, w, 0];
    case 3:
      return [-1, 0, 0, -1, w, h];
    case 4:
      return [1, 0, 0, -1, 0, h];
    case 5:
      return [0, 1, 1, 0, 0, 0];
    case 6:
      return [0, 1, -1, 0, h, 0];
    case 7:
      return [0, -1, -1, 0, h, w];
    case 8:
      return [0, -1, 1, 0, 0, w];
    default:
      return [1, 0, 0, 1, 0, 0];
  }
}
