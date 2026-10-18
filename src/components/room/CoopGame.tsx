"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useT } from "@/i18n";
import { CoopSync } from "@/lib/firebase/coop";
import type { RoomSession, RoomState } from "@/lib/firebase/room";
import type { PuzzleRecord } from "@/lib/firebase/types";
import { BoardModel, createPuzzleDef } from "@/lib/puzzle";
import { playWin } from "@/lib/render/sound";
import { Celebration, Stat } from "../game/Celebration";
import { GamePlay, type BoardApi } from "../game/GamePlay";
import { formatDuration } from "../game/Timer";
import { Button } from "../ui/Button";
import { useCursors } from "./useCursors";

export interface GameProps {
  session: RoomSession;
  state: RoomState;
  uid: string;
  puzzle: PuzzleRecord;
  image: ImageBitmap;
  headerLeft: ReactNode;
  headerRight: ReactNode;
  menu: ReactNode;
  onNewPuzzle: () => void;
  children?: ReactNode;
}

export function specOf(p: PuzzleRecord) {
  return { cols: p.cols, rows: p.rows, aspect: p.image.h / p.image.w, seed: p.seed, rotate: p.rotate };
}

export function CoopGame({ session, state, uid, puzzle, image, headerLeft, headerRight, menu, onNewPuzzle, children }: GameProps) {
  const t = useT();
  const roomId = session.roomId;
  const model = useMemo(() => new BoardModel(createPuzzleDef(specOf(puzzle)), {}), [puzzle.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const sync = useMemo(() => new CoopSync(roomId, uid, model, () => session.elapsedMs()), [roomId, uid, model, session]);
  const [loaded, setLoaded] = useState(false);
  const [api, setApi] = useState<BoardApi | null>(null);
  const [showResult, setShowResult] = useState(true);

  useEffect(() => {
    sync.start();
    let alive = true;
    void sync.ready.then(() => alive && setLoaded(true));
    return () => {
      alive = false;
      sync.stop();
    };
  }, [sync]);

  useCursors(session, state, api);

  // Si se pierde la conexión mientras se arrastra, soltar (el servidor libera el bloqueo).
  useEffect(() => {
    if (!state.connected) api?.input.release();
  }, [state.connected, api]);

  const done = !!puzzle.done;
  // Si lo termina otra persona, celebrar también aquí (quien encaja la última ya oyó la fanfarria).
  const doneAtMount = useRef(done);
  const finishedHere = useRef(false);
  useEffect(() => {
    if (done && !doneAtMount.current && !finishedHere.current) playWin();
    if (done) doneAtMount.current = true;
  }, [done]);
  const top = Object.entries(state.stats).sort((a, b) => b[1] - a[1])[0];
  const topName = top ? state.members[top[0]]?.name ?? "?" : null;

  if (!loaded) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-board text-[#fbf4ea]">
        <p role="status" className="animate-pulse-soft font-display text-lg">
          {t("room.connecting")}
        </p>
      </div>
    );
  }

  return (
    <GamePlay
      model={model}
      image={image}
      adapter={sync}
      getElapsed={() => session.elapsedMs()}
      timerRunning={!done}
      onReady={setApi}
      onComplete={() => {
        finishedHere.current = true;
      }}
      onCursor={(p) => session.sendCursor(p)}
      headerLeft={headerLeft}
      headerRight={headerRight}
      menu={menu}
    >
      {done && showResult && (
        <Celebration
          title={t("done.title")}
          actions={
            <>
              <Button onClick={onNewPuzzle}>{t("done.again")}</Button>
              <Button variant="secondary" onClick={() => setShowResult(false)}>
                {t("done.keep")}
              </Button>
            </>
          }
        >
          <Stat label={t("done.time")} value={formatDuration(puzzle.elapsed ?? 0)} />
          <Stat label={t("done.pieces")} value={model.def.count} />
          {top && topName && (
            <Stat
              label={t("done.top")}
              value={
                <span>
                  {topName} <span className="text-base font-normal text-ink-mute">· {t("done.joins", { n: top[1] })}</span>
                </span>
              }
            />
          )}
        </Celebration>
      )}
      {children}
    </GamePlay>
  );
}
