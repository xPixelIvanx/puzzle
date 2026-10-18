"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useT } from "@/i18n";
import type { Crop, WorkImage } from "@/lib/image/process";

type Handle = "move" | "nw" | "ne" | "sw" | "se";

export const ASPECTS: { key: string; label?: string; value: number | null | "original" }[] = [
  { key: "free", value: null },
  { key: "original", value: "original" },
  { key: "1:1", label: "1:1", value: 1 },
  { key: "4:3", label: "4:3", value: 3 / 4 },
  { key: "3:4", label: "3:4", value: 4 / 3 },
  { key: "16:9", label: "16:9", value: 9 / 16 },
];

/** Recorte centrado más grande posible con proporción alto/ancho = `aspect`. */
export function maxCrop(w: number, h: number, aspect: number | null): Crop {
  if (!aspect) return { x: 0, y: 0, w, h };
  let cw = w;
  let ch = w * aspect;
  if (ch > h) {
    ch = h;
    cw = h / aspect;
  }
  return { x: (w - cw) / 2, y: (h - ch) / 2, w: cw, h: ch };
}

function clampCrop(c: Crop, w: number, h: number): Crop {
  const cw = Math.min(c.w, w);
  const ch = Math.min(c.h, h);
  return { w: cw, h: ch, x: Math.min(Math.max(0, c.x), w - cw), y: Math.min(Math.max(0, c.y), h - ch) };
}

export function Cropper({
  image,
  crop,
  onChange,
  aspect,
  onAspect,
}: {
  image: WorkImage;
  crop: Crop;
  onChange: (c: Crop) => void;
  aspect: string;
  onAspect: (key: string) => void;
}) {
  const t = useT();
  const wrap = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [k, setK] = useState(0); // px de pantalla por px de imagen
  const drag = useRef<{ handle: Handle; start: { x: number; y: number }; crop: Crop } | null>(null);
  const ratio = (() => {
    const a = ASPECTS.find((x) => x.key === aspect)?.value ?? null;
    return a === "original" ? image.height / image.width : a;
  })();

  useEffect(() => {
    const el = wrap.current;
    const cv = canvasRef.current;
    if (!el || !cv) return;
    const draw = () => {
      const maxW = el.clientWidth;
      const maxH = Math.min(window.innerHeight * 0.55, 560);
      const scale = Math.min(maxW / image.width, maxH / image.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(image.width * scale * dpr);
      cv.height = Math.round(image.height * scale * dpr);
      cv.style.width = `${Math.round(image.width * scale)}px`;
      cv.style.height = `${Math.round(image.height * scale)}px`;
      const ctx = cv.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image.source, 0, 0, cv.width, cv.height);
      setK(scale);
    };
    draw();
    const obs = new ResizeObserver(draw);
    obs.observe(el);
    return () => obs.disconnect();
  }, [image]);

  const minSide = Math.max(32, Math.min(image.width, image.height) * 0.08);

  const onDown = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.target as HTMLElement;
    const handle = (target.dataset.handle as Handle | undefined) ?? "move";
    target.setPointerCapture(e.pointerId);
    drag.current = { handle, start: { x: e.clientX, y: e.clientY }, crop };
  };

  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || !k) return;
    const dx = (e.clientX - d.start.x) / k;
    const dy = (e.clientY - d.start.y) / k;
    const c = d.crop;
    if (d.handle === "move") return onChange(clampCrop({ ...c, x: c.x + dx, y: c.y + dy }, image.width, image.height));
    // Esquina fija opuesta
    const left = d.handle === "nw" || d.handle === "sw";
    const top = d.handle === "nw" || d.handle === "ne";
    const fx = left ? c.x + c.w : c.x;
    const fy = top ? c.y + c.h : c.y;
    let w = Math.max(minSide, left ? c.w - dx : c.w + dx);
    let h = Math.max(minSide, top ? c.h - dy : c.h + dy);
    if (ratio) {
      if (w * ratio > h) h = w * ratio;
      else w = h / ratio;
    }
    const maxW = left ? fx : image.width - fx;
    const maxH = top ? fy : image.height - fy;
    if (w > maxW) {
      w = maxW;
      if (ratio) h = w * ratio;
    }
    if (h > maxH) {
      h = maxH;
      if (ratio) w = h / ratio;
    }
    onChange({ x: left ? fx - w : fx, y: top ? fy - h : fy, w, h });
  };

  const onUp = () => {
    drag.current = null;
  };

  const onKey = (e: KeyboardEvent) => {
    const step = (e.shiftKey ? 0.1 : 0.02) * Math.max(image.width, image.height);
    const map: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const m = map[e.key];
    if (!m) return;
    e.preventDefault();
    onChange(clampCrop({ ...crop, x: crop.x + m[0], y: crop.y + m[1] }, image.width, image.height));
  };

  const handles: Handle[] = ["nw", "ne", "sw", "se"];
  const pos: Record<Exclude<Handle, "move">, string> = {
    nw: "-left-2 -top-2 cursor-nwse-resize",
    ne: "-right-2 -top-2 cursor-nesw-resize",
    sw: "-left-2 -bottom-2 cursor-nesw-resize",
    se: "-right-2 -bottom-2 cursor-nwse-resize",
  };

  return (
    <div>
      <div role="radiogroup" aria-label={t("creator.crop")} className="mb-3 flex flex-wrap gap-1.5">
        {ASPECTS.map((a) => (
          <button
            key={a.key}
            type="button"
            role="radio"
            aria-checked={aspect === a.key}
            onClick={() => onAspect(a.key)}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
              aspect === a.key ? "border-ink bg-ink text-paper" : "border-line bg-card text-ink-soft hover:border-ink-mute"
            }`}
          >
            {a.label ?? t(a.key === "free" ? "creator.aspect.free" : "creator.aspect.original")}
          </button>
        ))}
      </div>
      <div ref={wrap} className="flex w-full justify-center">
        <div className="relative touch-none select-none" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <canvas ref={canvasRef} className="block rounded-xl" />
          {k > 0 && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl" aria-hidden>
              <div
                className="absolute"
                style={{
                  left: crop.x * k,
                  top: crop.y * k,
                  width: crop.w * k,
                  height: crop.h * k,
                  boxShadow: "0 0 0 9999px rgb(30 22 18 / 0.55)",
                }}
              />
            </div>
          )}
          {k > 0 && (
            <div
              role="group"
              tabIndex={0}
              aria-label={t("creator.cropHelp")}
              onKeyDown={onKey}
              onPointerDown={onDown}
              className="absolute cursor-move rounded-sm outline-none ring-2 ring-white focus-visible:ring-4 focus-visible:ring-[#ffd9b8]"
              style={{
                left: crop.x * k,
                top: crop.y * k,
                width: crop.w * k,
                height: crop.h * k,
              }}
            >
              <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                {Array.from({ length: 9 }, (_, i) => (
                  <div key={i} className="border border-white/25" />
                ))}
              </div>
              {handles.map((h) => (
                <span
                  key={h}
                  data-handle={h}
                  onPointerDown={onDown}
                  className={`absolute size-5 rounded-full border-2 border-white bg-accent shadow ${pos[h as Exclude<Handle, "move">]}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 text-center text-sm text-ink-mute">{t("creator.cropHelp")}</p>
    </div>
  );
}
