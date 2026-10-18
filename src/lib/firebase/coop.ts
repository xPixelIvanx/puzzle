"use client";

import {
  increment,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  onDisconnect,
  onValue,
  ref,
  runTransaction,
  serverTimestamp,
  update,
  type Unsubscribe,
} from "firebase/database";
import type { GameAdapter, Merge } from "@/lib/game/controller";
import {
  acquireLockUpdate,
  isLockedByOther,
  LOCK_HEARTBEAT_MS,
  normRot,
  type BoardModel,
  type GroupData,
  type Lock,
  type Transform,
} from "@/lib/puzzle";
import { getFirebase, serverNow } from "./client";
import { groupKey, P, parseGroupKey } from "./paths";
import { round, touchActivity } from "./rooms";

/** Forma del grupo en la base de datos. */
export type DbGroup = {
  x?: number;
  y?: number;
  r?: number;
  l?: Lock | null;
  m?: string;
};

export function decodeGroup(v: DbGroup | null): GroupData | null {
  if (!v || typeof v !== "object") return null;
  const m = typeof v.m === "string" ? parseGroupKey(v.m) : NaN;
  const base: GroupData = { x: Number(v.x) || 0, y: Number(v.y) || 0, r: normRot(Number(v.r) || 0), l: v.l ?? null };
  return Number.isFinite(m) ? { ...base, m } : base;
}

const MOVE_MS = 40;

/**
 * Tablero compartido del modo cooperativo. Escucha los grupos con child_* (deltas) y escribe:
 * bloqueo por transacción al tomar, posición con throttling al arrastrar, y una escritura multi-ruta
 * al soltar (posición final + fusiones + liberar bloqueo + estadística).
 */
export class CoopSync implements GameAdapter {
  private unsubs: Unsubscribe[] = [];
  private pending = new Map<number, Transform>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastFlush = 0;
  private held = new Map<number, ReturnType<typeof setInterval>>();
  readonly ready: Promise<void>;
  private resolveReady!: () => void;

  constructor(
    private roomId: string,
    private uid: string,
    private model: BoardModel,
    /** tiempo jugado estimado (para guardarlo exacto al terminar) */
    private getElapsed: () => number = () => 0,
  ) {
    this.ready = new Promise((r) => (this.resolveReady = r));
  }

  start() {
    const { db } = getFirebase();
    const groupsRef = ref(db, P.groups(this.roomId));
    const apply = (key: string | null, v: unknown) => {
      const id = parseGroupKey(key ?? "");
      if (Number.isFinite(id)) this.model.applyRemote(id, decodeGroup(v as DbGroup));
    };
    // child_added llega para todos los grupos existentes antes del primer 'value' de la misma ruta.
    this.unsubs.push(
      onChildAdded(groupsRef, (s) => apply(s.key, s.val())),
      onChildChanged(groupsRef, (s) => apply(s.key, s.val())),
      onChildRemoved(groupsRef, (s) => apply(s.key, null)),
      onValue(groupsRef, () => this.resolveReady(), { onlyOnce: true }),
    );
  }

  stop() {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.flush();
    for (const gid of [...this.held.keys()]) this.stopHeartbeat(gid);
  }

  canInteract() {
    return true;
  }

  isFree(gid: number) {
    const g = this.model.groups.get(gid);
    return !!g && !isLockedByOther(g.lock, this.uid, serverNow());
  }

  async acquire(gid: number): Promise<boolean> {
    const { db } = getFirebase();
    const gref = ref(db, P.group(this.roomId, gid));
    try {
      const res = await runTransaction(
        gref,
        // Sin caché local, devolver null hace que el servidor responda con el valor real y se reintente.
        (cur: DbGroup | null) => (cur === null ? null : acquireLockUpdate(cur, this.uid, serverNow(), serverTimestamp())),
        { applyLocally: false },
      );
      if (!res.committed || res.snapshot.child("l/u").val() !== this.uid) return false;
      void onDisconnect(ref(db, `${P.group(this.roomId, gid)}/l`)).remove();
      this.startHeartbeat(gid);
      return true;
    } catch {
      return false;
    }
  }

  private startHeartbeat(gid: number) {
    this.stopHeartbeat(gid);
    const { db } = getFirebase();
    const id = setInterval(() => {
      void update(ref(db, P.group(this.roomId, gid)), { "l/t": serverTimestamp() }).catch(() => {});
    }, LOCK_HEARTBEAT_MS);
    this.held.set(gid, id);
  }

  private stopHeartbeat(gid: number) {
    const id = this.held.get(gid);
    if (id) clearInterval(id);
    this.held.delete(gid);
    const { db } = getFirebase();
    void onDisconnect(ref(db, `${P.group(this.roomId, gid)}/l`)).cancel();
  }

  moving(gid: number, t: Transform) {
    this.pending.set(gid, t);
    if (this.timer) return;
    const wait = Math.max(0, MOVE_MS - (performance.now() - this.lastFlush));
    this.timer = setTimeout(() => this.flush(), wait);
  }

  private flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.pending.size) return;
    this.lastFlush = performance.now();
    const { db } = getFirebase();
    const updates: Record<string, unknown> = {};
    for (const [gid, t] of this.pending) {
      const base = P.group(this.roomId, gid);
      updates[`${base}/x`] = round(t.x);
      updates[`${base}/y`] = round(t.y);
      updates[`${base}/r`] = t.r;
    }
    this.pending.clear();
    void update(ref(db), updates).catch(() => {});
  }

  dropped(gid: number, t: Transform, merges: Merge[]) {
    this.pending.delete(gid);
    this.stopHeartbeat(gid);
    const { db } = getFirebase();
    const updates: Record<string, unknown> = {};
    const merged = new Map(merges.map((m) => [m.from, m.into]));
    const intoSelf = merged.get(gid);
    if (intoSelf !== undefined) {
      // El grupo soltado deja de existir como raíz: se reemplaza por el puntero (y sin bloqueo).
      updates[P.group(this.roomId, gid)] = { m: groupKey(intoSelf) };
    } else {
      const base = P.group(this.roomId, gid);
      updates[`${base}/x`] = round(t.x);
      updates[`${base}/y`] = round(t.y);
      updates[`${base}/r`] = t.r;
      updates[`${base}/l`] = null;
    }
    for (const [from, into] of merged) {
      if (from !== gid) updates[P.group(this.roomId, from)] = { m: groupKey(into) };
    }
    if (merges.length) updates[`${P.stats(this.roomId)}/${this.uid}`] = increment(merges.length);
    if (this.model.isComplete()) {
      updates[`${P.puzzle(this.roomId)}/done`] = serverTimestamp();
      updates[`${P.puzzle(this.roomId)}/elapsed`] = Math.round(this.getElapsed());
    }
    this.flush();
    update(ref(db), updates).catch((e) => {
      console.warn("Soltar rechazado; el servidor revertirá el estado local", e);
    });
    void touchActivity(this.roomId);
  }

  released(gid: number, original: Transform) {
    this.pending.delete(gid);
    this.stopHeartbeat(gid);
    const { db } = getFirebase();
    // Si el bloqueo era de otra persona, las reglas rechazan esto y no pasa nada.
    void update(ref(db, P.group(this.roomId, gid)), {
      x: round(original.x),
      y: round(original.y),
      r: original.r,
      l: null,
    }).catch(() => {});
  }

  arranged(changes: Map<number, Transform>) {
    if (!changes.size) return;
    const { db } = getFirebase();
    const updates: Record<string, unknown> = {};
    for (const [gid, t] of changes) {
      const base = P.group(this.roomId, gid);
      updates[`${base}/x`] = round(t.x);
      updates[`${base}/y`] = round(t.y);
    }
    void update(ref(db), updates).catch(() => {});
  }
}
