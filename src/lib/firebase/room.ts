"use client";

import {
  increment,
  limitToLast,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  onDisconnect,
  onValue,
  push,
  query,
  ref,
  remove,
  serverTimestamp,
  set,
  update,
  type Unsubscribe,
} from "firebase/database";
import type { Vec } from "@/lib/puzzle";
import { cleanMessage } from "@/lib/sanitize";
import { getFirebase } from "./client";
import { P } from "./paths";
import type { ChatMessage, Member, Presence, Progress, PuzzleRecord, Round } from "./types";

export interface RoomState {
  connected: boolean;
  members: Record<string, Member>;
  presence: Record<string, Presence>;
  /** undefined = cargando; null = sin puzzle */
  puzzle: PuzzleRecord | null | undefined;
  stats: Record<string, number>;
  chat: ChatMessage[];
  round: Round | null;
  progress: Record<string, Progress>;
  /** ms locales en que llegó el último valor de `puzzle.elapsed` (para interpolar) */
  elapsedAt: number;
  /** me sacaron de la sala o se borró */
  gone: boolean;
}

export interface CursorEvent {
  uid: string;
  pos: Vec | null;
}

const CURSOR_MS = 50;
const TICK_MS = 10_000;

/**
 * Suscripciones de una sala para quien ya es miembro: presencia, miembros, puzzle, chat, versus y
 * cursores. Expone un estado inmutable para React (useSyncExternalStore). Los cursores van por un
 * canal aparte (alta frecuencia) directo al renderizador.
 */
export class RoomSession {
  private state: RoomState = {
    connected: false,
    members: {},
    presence: {},
    puzzle: undefined,
    stats: {},
    chat: [],
    round: null,
    progress: {},
    elapsedAt: 0,
    gone: false,
  };
  private listeners = new Set<() => void>();
  private cursorListeners = new Set<(e: CursorEvent) => void>();
  private unsubs: Unsubscribe[] = [];
  private cursorTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingCursor: Vec | null = null;
  private lastCursorSent = 0;
  private tick: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(
    readonly roomId: string,
    readonly uid: string,
  ) {}

  getState = () => this.state;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  onCursor(fn: (e: CursorEvent) => void) {
    this.cursorListeners.add(fn);
    return () => {
      this.cursorListeners.delete(fn);
    };
  }

  private set(patch: Partial<RoomState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  start() {
    // Puede reiniciarse tras stop() (doble montaje de efectos o rutas ocultas con <Activity>).
    this.stopped = false;
    const { db } = getFirebase();
    const r = this.roomId;
    const me = this.uid;
    const lost = () => this.set({ gone: true });

    this.unsubs.push(
      onValue(ref(db, ".info/connected"), (s) => {
        const connected = s.val() === true;
        this.set({ connected });
        if (!connected || this.stopped) return;
        // Al (re)conectar: registrar limpieza para cuando se caiga y marcarse presente.
        void onDisconnect(ref(db, P.presenceOf(r, me))).set({ on: false, at: serverTimestamp() });
        void onDisconnect(ref(db, P.cursor(r, me))).remove();
        void set(ref(db, P.presenceOf(r, me)), { on: true, at: serverTimestamp() }).catch(() => {});
      }),
    );

    this.unsubs.push(
      onValue(
        ref(db, P.members(r)),
        (s) => {
          const members = (s.val() ?? {}) as Record<string, Member>;
          if (!members[me]) lost();
          this.set({ members });
        },
        lost,
      ),
      onValue(ref(db, P.presence(r)), (s) => this.set({ presence: (s.val() ?? {}) as Record<string, Presence> }), lost),
      onValue(
        ref(db, P.puzzle(r)),
        (s) => {
          const puzzle = (s.val() as PuzzleRecord | null) ?? null;
          const prev = this.state.puzzle;
          const elapsedChanged = !prev || !puzzle || prev.elapsed !== puzzle.elapsed || prev.id !== puzzle.id;
          this.set({ puzzle, elapsedAt: elapsedChanged ? performance.now() : this.state.elapsedAt });
        },
        lost,
      ),
      onValue(ref(db, P.stats(r)), (s) => this.set({ stats: (s.val() ?? {}) as Record<string, number> }), lost),
      onValue(ref(db, P.round(r)), (s) => this.set({ round: (s.val() as Round | null) ?? null }), lost),
      onValue(ref(db, P.progress(r)), (s) => this.set({ progress: (s.val() ?? {}) as Record<string, Progress> }), lost),
      onChildAdded(query(ref(db, P.chat(r)), limitToLast(100)), (s) => {
        const m = s.val() as Omit<ChatMessage, "id">;
        if (!m || typeof m.t !== "string") return;
        const chat = [...this.state.chat, { ...m, id: s.key! }].slice(-100);
        this.set({ chat });
      }),
    );

    const cursorsRef = ref(db, P.cursors(r));
    const emit = (uid: string, v: unknown) => {
      if (uid === me) return;
      const pos = v && typeof v === "object" ? (v as Vec) : null;
      for (const l of this.cursorListeners) l({ uid, pos: pos && Number.isFinite(pos.x) ? pos : null });
    };
    this.unsubs.push(
      onChildAdded(cursorsRef, (s) => emit(s.key!, s.val())),
      onChildChanged(cursorsRef, (s) => emit(s.key!, s.val())),
      onChildRemoved(cursorsRef, (s) => emit(s.key!, null)),
    );

    this.tick = setInterval(() => this.keepTime(), TICK_MS);
  }

  /** Cronometrador: el miembro conectado de uid menor suma el tiempo jugado (modo cooperativo). */
  private keepTime() {
    const { puzzle, presence, connected } = this.state;
    if (!connected || !puzzle || puzzle.done || puzzle.mode !== "coop") return;
    const online = Object.entries(presence)
      .filter(([, p]) => p?.on)
      .map(([u]) => u)
      .sort();
    if (online[0] !== this.uid) return;
    const { db } = getFirebase();
    void update(ref(db, P.puzzle(this.roomId)), { elapsed: increment(TICK_MS) }).catch(() => {});
  }

  /** Tiempo jugado estimado del puzzle cooperativo. */
  elapsedMs(): number {
    const { puzzle, elapsedAt } = this.state;
    if (!puzzle) return 0;
    const base = puzzle.elapsed ?? 0;
    if (puzzle.done) return base;
    const anyoneOnline = Object.values(this.state.presence).some((p) => p?.on);
    return base + (anyoneOnline ? Math.min(TICK_MS + 2000, performance.now() - elapsedAt) : 0);
  }

  /** Posición del puntero en coordenadas normalizadas, como mucho cada 50 ms. */
  sendCursor(p: Vec) {
    this.pendingCursor = p;
    if (this.cursorTimer) return;
    const wait = Math.max(0, CURSOR_MS - (performance.now() - this.lastCursorSent));
    this.cursorTimer = setTimeout(() => {
      this.cursorTimer = null;
      const c = this.pendingCursor;
      if (!c || this.stopped) return;
      this.lastCursorSent = performance.now();
      const { db } = getFirebase();
      void set(ref(db, P.cursor(this.roomId, this.uid)), {
        x: Math.round(c.x * 1e4) / 1e4,
        y: Math.round(c.y * 1e4) / 1e4,
      }).catch(() => {});
    }, wait);
  }

  async sendChat(text: string) {
    const t = cleanMessage(text);
    if (!t) return;
    const me = this.state.members[this.uid];
    const { db } = getFirebase();
    await push(ref(db, P.chat(this.roomId)), { u: this.uid, n: me?.name ?? "?", c: me?.color ?? "#000000", t, at: serverTimestamp() });
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    for (const u of this.unsubs) u();
    this.unsubs = [];
    if (this.tick) clearInterval(this.tick);
    if (this.cursorTimer) clearTimeout(this.cursorTimer);
    if (!this.state.gone) {
      const { db } = getFirebase();
      void set(ref(db, P.presenceOf(this.roomId, this.uid)), { on: false, at: serverTimestamp() }).catch(() => {});
      void remove(ref(db, P.cursor(this.roomId, this.uid))).catch(() => {});
    }
  }
}
