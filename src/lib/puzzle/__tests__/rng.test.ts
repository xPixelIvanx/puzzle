import { describe, expect, it } from "vitest";
import {
  formatRoomCode,
  hashString,
  isValidRoomId,
  mulberry32,
  newRoomId,
  newSecureId,
  parseRoomCode,
  shuffle,
} from "../rng";

describe("PRNG", () => {
  it("es determinista por semilla", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const xs = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xs);
    expect(c()).not.toEqual(xs[0]);
    for (const x of xs) expect(x).toBeGreaterThanOrEqual(0);
    for (const x of xs) expect(x).toBeLessThan(1);
  });

  it("shuffle conserva elementos", () => {
    const arr = shuffle([1, 2, 3, 4, 5, 6, 7, 8], mulberry32(1));
    expect([...arr].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("hashString es estable", () => {
    expect(hashString("hola")).toBe(hashString("hola"));
    expect(hashString("hola")).not.toBe(hashString("Hola"));
  });
});

describe("IDs", () => {
  it("roomId de 12 caracteres Crockford", () => {
    const ids = new Set(Array.from({ length: 500 }, newRoomId));
    expect(ids.size).toBe(500);
    for (const id of ids) {
      expect(isValidRoomId(id)).toBe(true);
      expect(id).not.toMatch(/[ilou]/);
    }
  });

  it("formatea y vuelve a leer el código", () => {
    const id = newRoomId();
    const code = formatRoomCode(id);
    expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(parseRoomCode(code)).toBe(id);
    expect(parseRoomCode(` ${code.toLowerCase()} `)).toBe(id);
    expect(parseRoomCode(`https://ejemplo.com/r/${id}?x=1`)).toBe(id);
  });

  it("aplica equivalencias de Crockford y rechaza basura", () => {
    expect(parseRoomCode("OOOO-IIII-LLLL")).toBe("000011111111");
    expect(parseRoomCode("abc")).toBeNull();
    expect(parseRoomCode("<script>alert(1)</script>")).toBeNull();
  });

  it("newSecureId es base62 y largo", () => {
    const id = newSecureId();
    expect(id).toMatch(/^[0-9A-Za-z]{22}$/);
    expect(newSecureId()).not.toBe(id);
  });
});
