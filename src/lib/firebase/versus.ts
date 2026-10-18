"use client";

import { get, ref, runTransaction, serverTimestamp, set, update } from "firebase/database";
import type { GameAdapter, Merge } from "@/lib/game/controller";
import { randomSeed, scatter, type BoardModel, type GroupData, type Transform } from "@/lib/puzzle";
import { getFirebase, serverNow } from "./client";
import { decodeGroup, type DbGroup } from "./coop";
import { groupKey, P, parseGroupKey } from "./paths";
import { round as r5, touchActivity } from "./rooms";
import type { Progress, Round } from "./types";

/** Cuenta regresiva desde que se pide empezar (marca del servidor). */
export const COUNTDOWN_MS = 4000;

export function startTime(round: Round | null): number | null {
  return round?.at ? round.at + COUNTDOWN_MS : null;
}

export async function startRace(roomId: string) {
  const { db } = getFirebase();
  await update(ref(db, P.round(roomId)), { at: serverTimestamp() });
}

export async function rematch(roomId: string, current: Round, uid: string) {
  const { db } = getFirebase();
  await set(ref(db, P.round(roomId)), { n: current.n + 1, seed: randomSeed(), by: uid, at: serverTimestamp() });
}

function encodeBoard(groups: Record<number, GroupData>): Record<string, DbGroup> {
  const out: Record<string, DbGroup> = {};
  for (const [k, g] of Object.entries(groups)) {
    out[groupKey(Number(k))] = g.m !== undefined ? { m: groupKey(g.m) } : { x: r5(g.x), y: r5(g.y), r: g.r };
  }
  return out;
}

/**
 * Tablero propio del modo versus. Misma imagen y misma dispersión (semilla de la ronda) para todos.
 * Solo escribe al soltar: tablero (para continuar al reabrir) y progreso (barra del rival).
 */
export class VersusSync implements GameAdapter {
  moves = 0;
  private finished = false;

  constructor(
    private roomId: string,
    private uid: string,
    private model: BoardModel,
    private round: Round,
    private onFinish: () => void,
  ) {}

  /** Carga mi tablero de esta ronda o lo crea a partir de la semilla. */
  async init(): Promise<void> {
    const { db } = getFirebase();
    const [boardSnap, progSnap] = await Promise.all([
      get(ref(db, P.board(this.roomId, this.uid))),
      get(ref(db, `${P.progress(this.roomId)}/${this.uid}`)),
    ]);
    const board = boardSnap.val() as { n: number; g: Record<string, DbGroup> } | null;
    const prog = progSnap.val() as Progress | null;
    if (board?.n === this.round.n && board.g) {
      const groups: Record<number, GroupData> = {};
      for (const [k, v] of Object.entries(board.g)) {
        const id = parseGroupKey(k);
        const d = decodeGroup(v);
        if (Number.isFinite(id) && d) groups[id] = d;
      }
      this.model.load(groups);
      this.moves = prog?.n === this.round.n ? prog.moves : 0;
      this.finished = !!(prog?.n === this.round.n && prog.done);
      return;
    }
    const groups = scatter(this.model.def, this.round.seed);
    this.model.load(groups);
    this.moves = 0;
    await update(ref(db), {
      [P.board(this.roomId, this.uid)]: { n: this.round.n, g: encodeBoard(groups) },
      [`${P.progress(this.roomId)}/${this.uid}`]: { n: this.round.n, joined: 0, moves: 0 },
    });
  }

  canInteract() {
    const start = startTime(this.round);
    return start !== null && serverNow() >= start;
  }

  isFree() {
    return true;
  }

  async acquire() {
    return true;
  }

  moving() {}

  released() {}

  setRound(round: Round) {
    this.round = round;
  }

  dropped(gid: number, t: Transform, merges: Merge[]) {
    this.moves++;
    const { db } = getFirebase();
    const base = `${P.board(this.roomId, this.uid)}/g`;
    const updates: Record<string, unknown> = {};
    const merged = new Map(merges.map((m) => [m.from, m.into]));
    if (!merged.has(gid)) {
      updates[`${base}/${groupKey(gid)}`] = { x: r5(t.x), y: r5(t.y), r: t.r };
    }
    for (const [from, into] of merged) updates[`${base}/${groupKey(from)}`] = { m: groupKey(into) };
    const prog = `${P.progress(this.roomId)}/${this.uid}`;
    updates[`${prog}/n`] = this.round.n;
    updates[`${prog}/joined`] = this.model.def.count - this.model.groups.size;
    updates[`${prog}/moves`] = this.moves;
    const complete = this.model.isComplete() && !this.finished;
    if (complete) {
      this.finished = true;
      updates[`${prog}/done`] = serverTimestamp();
    }
    void update(ref(db), updates)
      .then(async () => {
        if (!complete) return;
        await runTransaction(ref(db, `${P.round(this.roomId)}/winner`), (cur) => (cur ? undefined : this.uid));
        this.onFinish();
      })
      .catch((e) => console.warn(e));
    void touchActivity(this.roomId);
  }

  arranged(changes: Map<number, Transform>) {
    const { db } = getFirebase();
    const base = `${P.board(this.roomId, this.uid)}/g`;
    const updates: Record<string, unknown> = {};
    for (const [gid, t] of changes) updates[`${base}/${groupKey(gid)}`] = { x: r5(t.x), y: r5(t.y), r: t.r };
    if (changes.size) void update(ref(db), updates).catch(() => {});
  }
}
