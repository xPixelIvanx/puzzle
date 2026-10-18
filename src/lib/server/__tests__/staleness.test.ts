import { describe, expect, it } from "vitest";
import { isStale, safeEqual, staleCutoff } from "../staleness";

const DAY = 86_400_000;

describe("limpieza", () => {
  const now = Date.UTC(2026, 9, 18);
  it("considera abandonada una sala sin actividad en 60 días", () => {
    expect(isStale(now - 61 * DAY, now)).toBe(true);
    expect(isStale(now - 59 * DAY, now)).toBe(false);
    expect(isStale(undefined, now)).toBe(true);
    expect(staleCutoff(now)).toBe(now - 60 * DAY);
  });
  it("compara el secreto sin atajos", () => {
    expect(safeEqual("Bearer abc", "Bearer abc")).toBe(true);
    expect(safeEqual("Bearer abd", "Bearer abc")).toBe(false);
    expect(safeEqual("short", "Bearer abc")).toBe(false);
  });
});
