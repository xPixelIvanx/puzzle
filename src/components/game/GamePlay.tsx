"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useT } from "@/i18n";
import { GameController, type ControllerHooks, type GameAdapter } from "@/lib/game/controller";
import { usePref } from "@/lib/prefs";
import { boardBounds, type BoardModel, type Vec } from "@/lib/puzzle";
import { buildAtlas, type PieceAtlas } from "@/lib/render/atlas";
import type { BoardRenderer } from "@/lib/render/BoardRenderer";
import { BoardInput } from "@/lib/render/input";
import { playSnap, playWin, setSoundEnabled } from "@/lib/render/sound";
import { ToolButton } from "../ui/Button";
import {
  IconEdges,
  IconExitFullscreen,
  IconEye,
  IconFit,
  IconFullscreen,
  IconGhost,
  IconHelp,
  IconMore,
  IconMute,
  IconPalette,
  IconRotate,
  IconSort,
  IconVolume,
} from "../ui/icons";
import { Timer } from "./Timer";

function subscribeFullscreen(cb: () => void) {
  document.addEventListener("fullscreenchange", cb);
  return () => document.removeEventListener("fullscreenchange", cb);
}

export interface BoardApi {
  renderer: BoardRenderer;
  controller: GameController;
  input: BoardInput;
  atlas: PieceAtlas;
}

export const BACKGROUNDS = [
  { key: "bg.walnut", color: "#3a2e27" },
  { key: "bg.felt", color: "#2e4a3c" },
  { key: "bg.slate", color: "#2c3440" },
  { key: "bg.wine", color: "#55303a" },
  { key: "bg.sand", color: "#cdbb9f" },
] as const;

export interface GamePlayProps {
  model: BoardModel;
  image: ImageBitmap;
  adapter: GameAdapter;
  getElapsed: () => number;
  timerRunning: boolean;
  onSnap?: (merges: number) => void;
  onDrop?: () => void;
  onComplete?: () => void;
  onReady?: (api: BoardApi | null) => void;
  onCursor?: (p: Vec) => void;
  headerLeft?: ReactNode;
  headerRight?: ReactNode;
  /** elementos extra del menú "más" */
  menu?: ReactNode;
  /** capas superpuestas (celebración, cuenta regresiva, chat…) */
  children?: ReactNode;
  /** reemplaza el contador de piezas (versus: barras de progreso) */
  status?: ReactNode;
}

export function GamePlay(props: GamePlayProps) {
  const { model, image, adapter } = props;
  const t = useT();
  const root = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<BoardApi | null>(null);
  const cb = useRef(props);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [placed, setPlaced] = useState(() => model.placedCount());
  const [preview, setPreview] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fullscreen = useSyncExternalStore(subscribeFullscreen, () => !!document.fullscreenElement, () => false);
  const canFullscreen = useSyncExternalStore(subscribeFullscreen, () => !!document.fullscreenEnabled, () => false);
  const [ghost, setGhost] = usePref("ghost", false);
  const [edgesOnly, setEdgesOnly] = useState(false);
  const [background, setBackground] = usePref<string>("background", BACKGROUNDS[0].color);
  const [sound, setSound] = usePref("sound", true);
  const previewCanvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    cb.current = props;
  });

  useEffect(() => setSoundEnabled(sound), [sound]);

  // Montaje: atlas → PixiJS → controlador → entrada
  useEffect(() => {
    let cancelled = false;
    let local: BoardApi | null = null;
    const el = host.current!;
    (async () => {
      try {
        const atlas = await buildAtlas(model.def, image, image.width, (p) => !cancelled && setProgress(p));
        if (cancelled) return;
        const { BoardRenderer } = await import("@/lib/render/BoardRenderer");
        const renderer = await BoardRenderer.create(el, model, atlas, image, background);
        if (cancelled) {
          renderer.destroy();
          return;
        }
        const hooks: ControllerHooks = {
          onSnap: (n, at) => {
            renderer.ripple(at.x, at.y);
            playSnap(Math.min(1.4, 0.8 + n * 0.2));
            cb.current.onSnap?.(n);
          },
          onDrop: () => cb.current.onDrop?.(),
          onComplete: () => {
            playWin();
            renderer.revealImage();
            renderer.fit(boardBounds(model), 48);
            cb.current.onComplete?.();
          },
          onDenied: () => {
            setToast(t("board.denied"));
          },
        };
        const controller = new GameController(model, renderer, adapter, hooks);
        const input = new BoardInput(renderer.canvas, renderer, controller);
        input.onCursor = (p) => cb.current.onCursor?.(p);
        renderer.fit(boardBounds(model));
        if (model.isComplete()) renderer.revealImage();
        local = { renderer, controller, input, atlas };
        api.current = local;
        if (process.env.NODE_ENV !== "production") (window as unknown as { __board?: BoardApi }).__board = local;
        setReady(true);
        cb.current.onReady?.(local);
      } catch (e) {
        console.error(e);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      cb.current.onReady?.(null);
      if (local) {
        local.input.destroy();
        local.controller.destroy();
        local.renderer.destroy();
      }
      api.current = null;
    };
    // El fondo inicial se aplica luego con setBackground; no recrear la escena por él.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, image, adapter]);

  // Contador de piezas colocadas (agrupado por frame)
  useEffect(() => {
    let raf = 0;
    const off = model.on(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setPlaced(model.placedCount());
        if (model.isComplete()) api.current?.renderer.revealImage();
      });
    });
    return () => {
      off();
      cancelAnimationFrame(raf);
    };
  }, [model]);

  useEffect(() => {
    if (!ready) return;
    api.current?.renderer.setGhost(ghost);
  }, [ghost, ready]);
  useEffect(() => {
    if (!ready) return;
    api.current?.renderer.setEdgesOnly(edgesOnly);
  }, [edgesOnly, ready]);
  useEffect(() => {
    if (!ready) return;
    api.current?.renderer.setBackground(background);
  }, [background, ready]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  // Imagen de vista previa
  useEffect(() => {
    const c = previewCanvas.current;
    if (!c) return;
    const k = Math.min(1, 1400 / Math.max(image.width, image.height));
    c.width = Math.round(image.width * k);
    c.height = Math.round(image.height * k);
    c.getContext("2d")!.drawImage(image, 0, 0, c.width, c.height);
  }, [image]);

  // Teclado: Z/X giran, espacio muestra la imagen
  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "z") api.current?.controller.rotate(-1);
      else if (k === "x") api.current?.controller.rotate(1);
      else if (e.code === "Space") {
        e.preventDefault();
        setPreview(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setPreview(false);
    };
    const blur = () => {
      setPreview(false);
      api.current?.input.release();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root.current?.requestFullscreen?.().catch(() => {});
  }, []);

  const fit = () => {
    const a = api.current;
    if (a) a.renderer.fit(boardBounds(model));
  };

  const sort = (mode: "edges" | "color") => {
    const a = api.current;
    if (a) a.controller.arrange(mode, a.atlas.hue);
    setSortOpen(false);
    setTimeout(fit, 30);
  };

  const total = model.def.count;
  const pct = Math.round(progress * 100);

  return (
    <div ref={root} className="fixed inset-0 overflow-hidden" style={{ background }}>
      <div
        ref={host}
        role="application"
        aria-label={t("board.aria")}
        aria-roledescription="puzzle"
        className="absolute inset-0"
      />

      {!ready && !failed && (
        <div className="absolute inset-0 grid place-items-center text-[#fbf4ea]" role="status">
          <div className="w-64 text-center">
            <p className="mb-3 font-display text-lg">{t("board.loading", { pct })}</p>
            <div className="h-2 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-[#ffd9b8] transition-[width]" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      )}
      {failed && (
        <div role="alert" className="absolute inset-0 grid place-items-center p-6 text-center text-[#fbf4ea]">
          {t("board.webglError")}
        </div>
      )}

      {/* Barra superior */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 sm:p-3 [padding-top:max(0.5rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto flex min-w-0 items-center gap-1">{props.headerLeft}</div>
        <div className="glass pointer-events-auto flex shrink-0 items-center gap-3 rounded-full px-4 py-2 text-sm font-semibold shadow-float">
          {props.status ?? (
            <span aria-live="off">{t("board.placed", { placed, total })}</span>
          )}
          <span className="h-4 w-px bg-white/25" aria-hidden />
          <span className="tabular-nums" aria-label={t("board.time")}>
            <Timer getMs={props.getElapsed} running={props.timerRunning} />
          </span>
        </div>
        <div className="pointer-events-auto flex min-w-0 items-center justify-end gap-1">{props.headerRight}</div>
      </div>

      {/* Barra inferior de herramientas */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-2 sm:p-3 [padding-bottom:max(0.5rem,env(safe-area-inset-bottom))]">
        <div
          role="toolbar"
          aria-label={t("tools.toolbar")}
          className="glass no-scrollbar pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full px-1.5 py-1 shadow-float"
        >
          <ToolButton
            label={t("tools.preview")}
            active={preview}
            onPointerDown={(e) => {
              e.preventDefault();
              setPreview(true);
            }}
            onPointerUp={() => setPreview(false)}
            onPointerLeave={() => setPreview(false)}
            onPointerCancel={() => setPreview(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setPreview(true);
            }}
            onKeyUp={() => setPreview(false)}
            onContextMenu={(e) => e.preventDefault()}
          >
            <IconEye />
          </ToolButton>
          <ToolButton label={t("tools.ghost")} active={ghost} aria-pressed={ghost} onClick={() => setGhost(!ghost)}>
            <IconGhost />
          </ToolButton>
          <ToolButton
            label={t("tools.edges")}
            active={edgesOnly}
            aria-pressed={edgesOnly}
            onClick={() => setEdgesOnly(!edgesOnly)}
          >
            <IconEdges />
          </ToolButton>
          <div className="relative">
            <ToolButton
              label={t("tools.sortEdges")}
              aria-expanded={sortOpen}
              aria-haspopup="menu"
              onClick={() => {
                setSortOpen(!sortOpen);
                setMenuOpen(false);
              }}
            >
              <IconSort />
            </ToolButton>
          </div>
          {model.def.spec.rotate && (
            <ToolButton label={t("tools.rotate")} onClick={() => api.current?.controller.rotate(1)}>
              <IconRotate />
            </ToolButton>
          )}
          <ToolButton label={t("tools.fit")} onClick={fit}>
            <IconFit />
          </ToolButton>
          <ToolButton
            label={t("tools.more")}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => {
              setMenuOpen(!menuOpen);
              setSortOpen(false);
            }}
          >
            <IconMore />
          </ToolButton>
        </div>
      </div>

      {sortOpen && (
        <Popover onClose={() => setSortOpen(false)}>
          <MenuItem onClick={() => sort("edges")} icon={<IconEdges />}>
            {t("tools.sortEdges")}
          </MenuItem>
          <MenuItem onClick={() => sort("color")} icon={<IconPalette />}>
            {t("tools.sortColor")}
          </MenuItem>
        </Popover>
      )}

      {menuOpen && (
        <Popover onClose={() => setMenuOpen(false)}>
          <div className="px-3 pb-2 pt-1">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/60">{t("tools.background")}</p>
            <div className="flex flex-wrap items-center gap-2">
              {BACKGROUNDS.map((b) => (
                <button
                  key={b.color}
                  type="button"
                  aria-label={t(b.key)}
                  title={t(b.key)}
                  aria-pressed={background === b.color}
                  onClick={() => setBackground(b.color)}
                  className={`size-8 rounded-full border-2 ${background === b.color ? "border-white" : "border-white/20"}`}
                  style={{ background: b.color }}
                />
              ))}
              <label className="relative size-8 cursor-pointer overflow-hidden rounded-full border-2 border-white/20" title={t("bg.custom")}>
                <span className="sr-only">{t("bg.custom")}</span>
                <input
                  type="color"
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                  className="absolute -inset-2 size-12 cursor-pointer"
                />
              </label>
            </div>
          </div>
          <MenuItem onClick={() => setSound(!sound)} icon={sound ? <IconVolume /> : <IconMute />}>
            {sound ? t("tools.soundOn") : t("tools.soundOff")}
          </MenuItem>
          {canFullscreen && (
            <MenuItem onClick={toggleFullscreen} icon={fullscreen ? <IconExitFullscreen /> : <IconFullscreen />}>
              {fullscreen ? t("tools.exitFullscreen") : t("tools.fullscreen")}
            </MenuItem>
          )}
          <MenuItem
            onClick={() => {
              setHelpOpen(true);
              setMenuOpen(false);
            }}
            icon={<IconHelp />}
          >
            {t("tools.help")}
          </MenuItem>
          {props.menu}
        </Popover>
      )}

      {helpOpen && (
        <Popover onClose={() => setHelpOpen(false)}>
          <p className="max-w-xs px-3 py-2 text-sm leading-relaxed">{t("tools.helpBody")}</p>
        </Popover>
      )}

      {/* Vista previa de la imagen completa */}
      <div
        aria-hidden={!preview}
        className={`pointer-events-none absolute inset-0 grid place-items-center bg-[#140d0a]/70 p-6 transition-opacity duration-150 ${
          preview ? "opacity-100" : "opacity-0"
        }`}
      >
        <canvas ref={previewCanvas} className="max-h-[80vh] max-w-full rounded-xl object-contain shadow-float" />
      </div>

      {toast && (
        <div role="status" className="glass absolute left-1/2 top-16 -translate-x-1/2 animate-fade-up rounded-full px-4 py-2 text-sm">
          {toast}
        </div>
      )}

      {props.children}
    </div>
  );
}

function Popover({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <>
      <button type="button" aria-hidden tabIndex={-1} className="absolute inset-0 cursor-default" onClick={onClose} />
      <div
        role="menu"
        className="glass absolute bottom-20 left-1/2 w-[min(92vw,20rem)] -translate-x-1/2 animate-fade-up rounded-3xl p-2 shadow-float [margin-bottom:env(safe-area-inset-bottom)]"
      >
        {children}
      </div>
    </>
  );
}

export function MenuItem({ children, onClick, icon }: { children: ReactNode; onClick: () => void; icon?: ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 text-left text-sm font-semibold hover:bg-white/10"
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}
