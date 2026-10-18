"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Celebration, Stat } from "@/components/game/Celebration";
import { GamePlay, MenuItem } from "@/components/game/GamePlay";
import { HeaderLink } from "@/components/game/HeaderButton";
import { formatDuration } from "@/components/game/Timer";
import { PuzzleCreator, type CreatedPuzzle } from "@/components/PuzzleCreator";
import { Button } from "@/components/ui/Button";
import { IconHome, IconPuzzle } from "@/components/ui/icons";
import { useT } from "@/i18n";
import type { GameAdapter } from "@/lib/game/controller";
import { Stopwatch } from "@/lib/game/stopwatch";
import { BoardModel, createPuzzleDef, randomSeed, scatter, type GroupData, type PuzzleSpec } from "@/lib/puzzle";
import { idbDel, idbGet, idbSet } from "@/lib/storage/localDb";

interface SoloSave {
  v: 1;
  spec: PuzzleSpec;
  image: Blob;
  groups: Record<number, GroupData>;
  elapsed: number;
  done: boolean;
}

const KEY = "solo";

interface Game {
  save: SoloSave;
  model: BoardModel;
  bitmap: ImageBitmap;
}

export function SoloClient() {
  const t = useT();
  const [phase, setPhase] = useState<"loading" | "create" | "play">("loading");
  const [game, setGame] = useState<Game | null>(null);
  const [done, setDone] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [finalMs, setFinalMs] = useState(0);
  const watch = useRef(new Stopwatch());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameRef = useRef<Game | null>(null);
  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  const open = useCallback(async (save: SoloSave) => {
    const bitmap = await createImageBitmap(save.image);
    const model = new BoardModel(createPuzzleDef(save.spec), save.groups);
    watch.current = new Stopwatch(save.elapsed);
    setGame({ save, model, bitmap });
    setDone(save.done);
    setShowResult(false);
    setPhase("play");
  }, []);

  useEffect(() => {
    let alive = true;
    void idbGet<SoloSave>(KEY).then(async (s) => {
      if (!alive) return;
      if (s?.v === 1) {
        try {
          await open(s);
          return;
        } catch {
          /* guardado corrupto: empezar de nuevo */
        }
      }
      setPhase("create");
    });
    return () => {
      alive = false;
    };
  }, [open]);

  const persist = useCallback((g: Game, extra: Partial<SoloSave> = {}) => {
    g.save = { ...g.save, groups: g.model.serialize(), elapsed: watch.current.ms, ...extra };
    void idbSet(KEY, g.save);
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (gameRef.current) persist(gameRef.current);
    }, 400);
  }, [persist]);

  // Cronómetro: corre mientras se juega y la pestaña está visible.
  useEffect(() => {
    if (phase !== "play" || done) return;
    const sync = () => (document.visibilityState === "visible" ? watch.current.start() : watch.current.pause());
    sync();
    const onHide = () => {
      sync();
      if (game && document.visibilityState !== "visible") persist(game);
    };
    document.addEventListener("visibilitychange", onHide);
    const id = setInterval(() => game && persist(game), 15000);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      clearInterval(id);
      watch.current.pause();
      if (game) persist(game);
    };
  }, [phase, done, game, persist]);

  const adapter = useMemo<GameAdapter>(
    () => ({
      canInteract: () => true,
      isFree: () => true,
      acquire: async () => true,
      moving: () => {},
      dropped: scheduleSave,
      released: () => {},
      arranged: scheduleSave,
    }),
    [scheduleSave],
  );

  const create = async (p: CreatedPuzzle) => {
    const spec: PuzzleSpec = {
      cols: p.cols,
      rows: p.rows,
      aspect: p.image.height / p.image.width,
      seed: randomSeed(),
      rotate: p.rotate,
    };
    const groups = scatter(createPuzzleDef(spec), spec.seed);
    const save: SoloSave = { v: 1, spec, image: p.image.blob, groups, elapsed: 0, done: false };
    await idbSet(KEY, save);
    await open(save);
  };

  const restart = () => {
    game?.bitmap.close();
    setGame(null);
    void idbDel(KEY);
    setPhase("create");
  };

  if (phase === "loading") {
    return (
      <main className="paper-grain grid min-h-dvh place-items-center">
        <p role="status" className="animate-pulse-soft font-display text-lg text-ink-soft">
          {t("common.loading")}
        </p>
      </main>
    );
  }

  if (phase === "create" || !game) {
    return (
      <main className="paper-grain min-h-dvh px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <Link href="/" className="mb-6 inline-flex items-center gap-2 font-semibold text-ink-soft hover:text-ink">
            <IconHome /> {t("app.name")}
          </Link>
          <PuzzleCreator onCreate={create} />
        </div>
      </main>
    );
  }

  return (
    <GamePlay
      model={game.model}
      image={game.bitmap}
      adapter={adapter}
      getElapsed={() => watch.current.ms}
      timerRunning={!done}
      onComplete={() => {
        watch.current.pause();
        setFinalMs(watch.current.ms);
        setDone(true);
        setShowResult(true);
        persist(game, { done: true });
      }}
      headerLeft={
        <HeaderLink href="/" label={t("room.home")}>
          <IconHome />
        </HeaderLink>
      }
      menu={
        <MenuItem onClick={restart} icon={<IconPuzzle />}>
          {t("tools.newPuzzle")}
        </MenuItem>
      }
    >
      {done && showResult && (
        <Celebration
          title={t("done.titleSolo")}
          actions={
            <>
              <Button onClick={restart}>{t("done.again")}</Button>
              <Button variant="secondary" onClick={() => setShowResult(false)}>
                {t("done.keep")}
              </Button>
            </>
          }
        >
          <Stat label={t("done.time")} value={formatDuration(finalMs)} />
          <Stat label={t("done.pieces")} value={game.model.def.count} />
        </Celebration>
      )}
    </GamePlay>
  );
}
