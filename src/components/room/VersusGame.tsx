"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/i18n";
import { serverNow } from "@/lib/firebase/client";
import type { Round } from "@/lib/firebase/types";
import { rematch, startRace, startTime, VersusSync } from "@/lib/firebase/versus";
import { BoardModel, createPuzzleDef } from "@/lib/puzzle";
import { playWin } from "@/lib/render/sound";
import { Celebration, Stat } from "../game/Celebration";
import { GamePlay } from "../game/GamePlay";
import { formatDuration } from "../game/Timer";
import { Button } from "../ui/Button";
import { specOf, type GameProps } from "./CoopGame";

export function VersusGame(props: GameProps) {
  const { state, puzzle } = props;
  const round = state.round;
  if (!round) return null;
  if (!round.at) return <Lobby {...props} round={round} />;
  return <Race key={`${puzzle.id}:${round.n}`} {...props} round={round} />;
}

function Lobby({ session, state, uid, puzzle, image, round, children }: GameProps & { round: Round }) {
  const t = useT();
  const preview = useRef<HTMLCanvasElement>(null);
  const [busy, setBusy] = useState(false);
  const online = Object.entries(state.members).filter(([u]) => state.presence[u]?.on);

  useEffect(() => {
    const c = preview.current;
    if (!c) return;
    const k = 480 / Math.max(image.width, image.height);
    c.width = Math.round(image.width * k);
    c.height = Math.round(image.height * k);
    c.getContext("2d")!.drawImage(image, 0, 0, c.width, c.height);
  }, [image]);

  return (
    <main className="paper-grain grid min-h-dvh place-items-center px-4 py-8">
      <div className="w-full max-w-md animate-fade-up rounded-[2rem] border border-line bg-card p-7 text-center shadow-soft">
        <p className="text-sm font-semibold uppercase tracking-widest text-accent">{t("creator.mode.versus")}</p>
        <h1 className="mt-1 font-display text-3xl font-semibold">{online.length < 2 ? t("versus.waiting") : t("versus.ready")}</h1>
        <canvas ref={preview} className="mx-auto mt-5 max-h-56 rounded-2xl shadow-soft" aria-hidden />
        <p className="mt-3 text-sm text-ink-mute">
          {t("creator.piecesValue", { count: puzzle.cols * puzzle.rows, cols: puzzle.cols, rows: puzzle.rows })}
        </p>
        <ul className="mt-5 flex flex-wrap justify-center gap-2">
          {online.map(([u, m]) => (
            <li key={u} className="flex items-center gap-2 rounded-full bg-paper px-3 py-1.5 text-sm font-semibold">
              <span className="size-3 rounded-full" style={{ background: m.color }} aria-hidden />
              {m.name}
              {u === uid && <span className="font-normal text-ink-mute">({t("common.you")})</span>}
            </li>
          ))}
        </ul>
        {online.length < 2 && <p className="mt-4 text-sm text-ink-soft">{t("versus.waitingBody")}</p>}
        <Button
          className="mt-6 w-full"
          disabled={online.length < 2 || busy}
          onClick={() => {
            setBusy(true);
            void startRace(session.roomId).finally(() => setBusy(false));
          }}
        >
          {t("versus.start")}
        </Button>
        <p className="sr-only">{round.n}</p>
      </div>
      <div className="fixed inset-0 pointer-events-none [&>*]:pointer-events-auto">{children}</div>
    </main>
  );
}

function Race({ session, state, uid, puzzle, image, headerLeft, headerRight, menu, onNewPuzzle, round, children }: GameProps & { round: Round }) {
  const t = useT();
  const roomId = session.roomId;
  const model = useMemo(() => new BoardModel(createPuzzleDef(specOf(puzzle)), {}), [puzzle.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [loaded, setLoaded] = useState(false);
  const [showResult, setShowResult] = useState(true);
  const [now, setNow] = useState(() => serverNow());
  const sync = useMemo(() => new VersusSync(roomId, uid, model, round, () => playWin()), [roomId, uid, model, round.n]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    sync.setRound(round);
  }, [sync, round]);

  useEffect(() => {
    let alive = true;
    void sync.init().then(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [sync]);

  const start = startTime(round) ?? 0;
  const countingDown = now < start;
  useEffect(() => {
    if (!countingDown) return;
    const id = setInterval(() => setNow(serverNow()), 100);
    return () => clearInterval(id);
  }, [countingDown]);

  const mine = state.progress[uid];
  const myDone = mine?.n === round.n ? mine.done : undefined;
  const total = Math.max(1, model.def.count - 1);
  const players = Object.entries(state.members).sort((a, b) => (a[0] === uid ? -1 : b[0] === uid ? 1 : a[1].slot - b[1].slot));
  const winner = round.winner;
  const winnerName = winner ? state.members[winner]?.name ?? "?" : null;

  const status = (
    <div className="flex items-center gap-3" aria-live="off">
      {players.map(([u, m]) => {
        const p = state.progress[u];
        const joined = p?.n === round.n ? p.joined : 0;
        const pct = Math.round((joined / total) * 100);
        return (
          <div key={u} className="flex items-center gap-2" title={t("versus.progress", { name: m.name })}>
            <span className="max-w-16 truncate text-xs">{u === uid ? t("versus.you") : m.name}</span>
            <span
              role="progressbar"
              aria-label={t("versus.progress", { name: m.name })}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              className="block h-2 w-14 overflow-hidden rounded-full bg-white/20 sm:w-20"
            >
              <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: m.color }} />
            </span>
          </div>
        );
      })}
    </div>
  );

  if (!loaded) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-board text-[#fbf4ea]">
        <p role="status" className="animate-pulse-soft font-display text-lg">
          {t("room.connecting")}
        </p>
      </div>
    );
  }

  const left = Math.ceil((start - now) / 1000);

  return (
    <GamePlay
      model={model}
      image={image}
      adapter={sync}
      getElapsed={() => (myDone ? myDone - start : Math.max(0, serverNow() - start))}
      timerRunning={!myDone && !countingDown}
      status={status}
      headerLeft={headerLeft}
      headerRight={headerRight}
      menu={menu}
    >
      {countingDown && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-[#140d0a]/55" role="status" aria-live="assertive">
          <div key={left} className="animate-pop text-center text-[#fbf4ea]">
            <p className="font-display text-2xl">{t("versus.ready")}</p>
            <p className="font-display text-[9rem] font-semibold leading-none tabular-nums">{left > 0 ? left : t("versus.go")}</p>
          </div>
        </div>
      )}
      {winner && showResult && (
        <Celebration
          title={winner === uid ? t("versus.won") : t("versus.lost", { name: winnerName ?? "?" })}
          actions={
            <>
              <Button onClick={() => void rematch(roomId, round, uid)}>{t("versus.rematch")}</Button>
              <Button variant="secondary" onClick={() => setShowResult(false)}>
                {t("versus.keepPlaying")}
              </Button>
              <Button variant="ghost" onClick={onNewPuzzle}>
                {t("tools.newPuzzle")}
              </Button>
            </>
          }
        >
          {players.map(([u, m]) => {
            const p = state.progress[u];
            const current = p?.n === round.n ? p : null;
            return (
              <Stat
                key={u}
                label={`${m.name}${u === uid ? ` (${t("common.you")})` : ""}`}
                value={
                  <span className="text-base">
                    {current?.done ? formatDuration(current.done - start) : t("versus.notFinished")}
                    <span className="ml-2 font-normal text-ink-mute">{t("versus.moves", { n: current?.moves ?? 0 })}</span>
                  </span>
                }
              />
            );
          })}
        </Celebration>
      )}
      {children}
    </GamePlay>
  );
}
