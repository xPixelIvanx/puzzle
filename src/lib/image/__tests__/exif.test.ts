import { describe, expect, it } from "vitest";
import {
  buildExifOrientationSegment,
  injectSegment,
  orientationTransform,
  parseJpegInfo,
  swapsDimensions,
} from "../exif";

/** JPEG mínimo sintético: SOI + SOF0 (dimensiones) + SOS + EOI. Suficiente para el parser. */
function fakeJpeg(width: number, height: number): Uint8Array {
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return new Uint8Array([0xff, 0xd8, ...sof, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]);
}

function apply(m: number[], x: number, y: number) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

describe("EXIF", () => {
  it("lee dimensiones sin EXIF", () => {
    expect(parseJpegInfo(fakeJpeg(640, 480))).toEqual({ orientation: 1, width: 640, height: 480 });
  });

  it("lee la orientación de un segmento APP1 (big-endian)", () => {
    for (const o of [1, 3, 6, 8]) {
      const jpeg = injectSegment(fakeJpeg(4000, 3000), buildExifOrientationSegment(o));
      expect(parseJpegInfo(jpeg)).toEqual({ orientation: o, width: 4000, height: 3000 });
    }
  });

  it("lee orientación little-endian", () => {
    const seg = buildExifOrientationSegment(6);
    // Convertir a "II": invertir bytes de los campos de 16/32 bits del TIFF
    const le = Uint8Array.from(seg);
    const t = 4 + 6; // inicio TIFF
    le.set([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0, 0, 0, 0], t);
    expect(parseJpegInfo(injectSegment(fakeJpeg(10, 20), le))?.orientation).toBe(6);
  });

  it("rechaza archivos que no son JPEG", () => {
    expect(parseJpegInfo(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });

  it("no se rompe con datos truncados", () => {
    const jpeg = injectSegment(fakeJpeg(100, 50), buildExifOrientationSegment(6)).slice(0, 20);
    expect(() => parseJpegInfo(jpeg)).not.toThrow();
  });

  it("las transformaciones llevan la imagen a [0,w']×[0,h']", () => {
    const w = 4;
    const h = 2;
    for (let o = 1; o <= 8; o++) {
      const m = orientationTransform(o, w, h);
      const [W, H] = swapsDimensions(o) ? [h, w] : [w, h];
      for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) {
        const [X, Y] = apply(m, x, y);
        expect(X).toBeGreaterThanOrEqual(0);
        expect(X).toBeLessThanOrEqual(W);
        expect(Y).toBeGreaterThanOrEqual(0);
        expect(Y).toBeLessThanOrEqual(H);
      }
    }
  });
});
