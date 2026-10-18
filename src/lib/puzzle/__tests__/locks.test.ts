import { describe, expect, it } from "vitest";
import { acquireLockUpdate, canWriteGroup, isLockActive, isLockedByOther, LOCK_TTL_MS } from "../locks";

const now = 1_000_000;
const STAMP = { ".sv": "timestamp" };

describe("bloqueos", () => {
  it("toma un grupo libre", () => {
    const next = acquireLockUpdate({ x: 1, y: 2, r: 0 }, "ana", now, STAMP);
    expect(next).toEqual({ x: 1, y: 2, r: 0, l: { u: "ana", t: STAMP } });
  });

  it("no puede tomar un grupo bloqueado por otra persona", () => {
    expect(acquireLockUpdate({ x: 0, y: 0, r: 0, l: { u: "beto", t: now - 1000 } }, "ana", now, STAMP)).toBeUndefined();
  });

  it("puede volver a tomar su propio bloqueo (refresco)", () => {
    expect(acquireLockUpdate({ x: 0, y: 0, r: 0, l: { u: "ana", t: now - 1000 } }, "ana", now, STAMP)).toBeDefined();
  });

  it("un bloqueo caducado se puede tomar", () => {
    const stale = { u: "beto", t: now - LOCK_TTL_MS - 1 };
    expect(isLockActive(stale, now)).toBe(false);
    expect(acquireLockUpdate({ x: 0, y: 0, r: 0, l: stale }, "ana", now, STAMP)).toBeDefined();
  });

  it("no se bloquea un grupo ya fusionado ni uno inexistente", () => {
    expect(acquireLockUpdate({ m: "g3" }, "ana", now, STAMP)).toBeUndefined();
    expect(acquireLockUpdate(null, "ana", now, STAMP)).toBeUndefined();
  });

  it("canWriteGroup refleja la regla de la base de datos", () => {
    expect(canWriteGroup({ x: 0, l: null }, "ana", now)).toBe(true);
    expect(canWriteGroup({ x: 0, l: { u: "ana", t: now } }, "ana", now)).toBe(true);
    expect(canWriteGroup({ x: 0, l: { u: "beto", t: now } }, "ana", now)).toBe(false);
    expect(canWriteGroup({ m: "g1" }, "ana", now)).toBe(false);
    expect(isLockedByOther({ u: "beto", t: now - LOCK_TTL_MS - 5 }, "ana", now)).toBe(false);
  });

  it("dos jugadores compitiendo: solo uno obtiene el bloqueo (transacción secuencial)", () => {
    let server: Record<string, unknown> = { x: 0, y: 0, r: 0 };
    const tryLock = (uid: string) => {
      const next = acquireLockUpdate(server, uid, now, { u: uid, t: now });
      if (next) server = { ...next, l: { u: uid, t: now } };
      return !!next;
    };
    expect(tryLock("ana")).toBe(true);
    expect(tryLock("beto")).toBe(false);
    expect((server as { l: { u: string } }).l.u).toBe("ana");
  });
});
