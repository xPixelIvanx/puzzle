"use client";

import { useEffect, useId, useMemo, useRef, useState, type DragEvent } from "react";
import { useT, type TKey } from "@/i18n";
import {
  ACCEPT_ATTR,
  decodeImageFile,
  decodeImageUrl,
  exportImage,
  ImageError,
  type Crop,
  type ExportedImage,
  type WorkImage,
} from "@/lib/image/process";
import { gridOptions, MAX_ASPECT } from "@/lib/puzzle";
import type { GameMode } from "@/lib/firebase/types";
import { Cropper, maxCrop, ASPECTS } from "./Cropper";
import { Button } from "./ui/Button";
import { IconUpload } from "./ui/icons";


export interface CreatedPuzzle {
  image: ExportedImage;
  cols: number;
  rows: number;
  rotate: boolean;
  mode: GameMode;
}

export const GALLERY: { file: string; key: TKey }[] = [
  { file: "sunset.svg", key: "gallery.sunset" },
  { file: "balloons.svg", key: "gallery.balloons" },
  { file: "garden.svg", key: "gallery.garden" },
  { file: "city.svg", key: "gallery.city" },
  { file: "sea.svg", key: "gallery.sea" },
  { file: "tiles.svg", key: "gallery.tiles" },
];

const DEFAULT_TARGET = 100;

export function PuzzleCreator({
  showMode = false,
  busy = null,
  error = null,
  onCreate,
}: {
  showMode?: boolean;
  /** texto de progreso externo (p. ej. subida) */
  busy?: string | null;
  error?: string | null;
  onCreate: (p: CreatedPuzzle) => void | Promise<void>;
}) {
  const t = useT();
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<WorkImage | null>(null);
  const [crop, setCrop] = useState<Crop | null>(null);
  const [aspect, setAspect] = useState("original");
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [optionIndex, setOptionIndex] = useState<number | null>(null);
  const [rotate, setRotate] = useState(false);
  const [mode, setMode] = useState<GameMode>("coop");
  const [exporting, setExporting] = useState(false);

  const cropAspect = crop ? crop.h / crop.w : 1;
  const options = useMemo(() => gridOptions(cropAspect), [cropAspect]);
  const defaultIndex = useMemo(() => {
    let best = 0;
    options.forEach((o, i) => {
      if (Math.abs(o.count - DEFAULT_TARGET) < Math.abs(options[best].count - DEFAULT_TARGET)) best = i;
    });
    return best;
  }, [options]);
  const index = Math.min(optionIndex ?? defaultIndex, options.length - 1);
  const grid = options[index];

  useEffect(() => {
    return () => {
      if (image?.source instanceof ImageBitmap) image.source.close();
    };
  }, [image]);

  const load = async (task: () => Promise<WorkImage>) => {
    setLoading(true);
    setLocalError(null);
    try {
      const img = await task();
      setImage(img);
      setAspect("original");
      setCrop(maxCrop(img.width, img.height, null));
    } catch (e) {
      const code = e instanceof ImageError ? e.code : "decode";
      setLocalError(t(`creator.error.${code}` as TKey));
    } finally {
      setLoading(false);
    }
  };

  const onFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (f) void load(() => decodeImageFile(f));
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    onFiles(e.dataTransfer.files);
  };

  const chooseAspect = (key: string) => {
    if (!image) return;
    setAspect(key);
    const a = ASPECTS.find((x) => x.key === key)?.value ?? null;
    const ratio = a === "original" ? null : a;
    setCrop(maxCrop(image.width, image.height, ratio));
  };

  const submit = async () => {
    if (!image || !crop || exporting) return;
    const ratio = crop.h / crop.w;
    if (ratio > MAX_ASPECT || ratio < 1 / MAX_ASPECT) {
      setLocalError(t("creator.error.aspect"));
      return;
    }
    setExporting(true);
    setLocalError(null);
    try {
      const exported = await exportImage(image, crop);
      await onCreate({ image: exported, cols: grid.cols, rows: grid.rows, rotate, mode });
    } catch (e) {
      const code = e instanceof ImageError ? e.code : "decode";
      setLocalError(t(`creator.error.${code}` as TKey));
    } finally {
      setExporting(false);
    }
  };

  const shownError = localError ?? error;

  if (!image || !crop) {
    return (
      <div className="animate-fade-up">
        <h2 className="mb-4 font-display text-2xl font-semibold">{t("creator.title")}</h2>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed px-6 py-10 text-center transition ${
            dragOver ? "border-accent bg-accent-soft/60" : "border-line bg-card"
          }`}
        >
          <span className="grid size-14 place-items-center rounded-full bg-accent-soft text-accent">
            <IconUpload width={26} height={26} />
          </span>
          <p className="font-display text-xl">{t("creator.drop")}</p>
          <p className="text-sm text-ink-mute">{t("creator.or")}</p>
          <Button onClick={() => fileInput.current?.click()} disabled={loading}>
            {t("creator.pick")}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT_ATTR}
            className="sr-only"
            aria-label={t("creator.pick")}
            onChange={(e) => {
              onFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <p className="max-w-sm text-sm text-ink-mute">{t("creator.formats")}</p>
          {loading && (
            <p role="status" className="animate-pulse-soft text-sm font-semibold text-ink-soft">
              {t("creator.processing")}
            </p>
          )}
        </div>
        {shownError && (
          <p role="alert" className="mt-3 text-sm font-semibold text-danger">
            {shownError}
          </p>
        )}
        <h3 className="mb-3 mt-7 text-sm font-semibold uppercase tracking-wider text-ink-mute">{t("creator.gallery")}</h3>
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {GALLERY.map((g) => (
            <li key={g.file}>
              <button
                type="button"
                disabled={loading}
                onClick={() => void load(() => decodeImageUrl(`/gallery/${g.file}`))}
                className="group block w-full overflow-hidden rounded-2xl border border-line bg-card text-left shadow-soft transition hover:-translate-y-0.5"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático local */}
                <img src={`/gallery/${g.file}`} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />
                <span className="block truncate px-2 py-1.5 text-xs font-semibold text-ink-soft">{t(g.key)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const busyText = busy ?? (exporting ? t("creator.processing") : null);

  return (
    <div className="grid animate-fade-up gap-6 lg:grid-cols-[1fr_20rem]">
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-semibold">{t("creator.crop")}</h2>
          <Button variant="ghost" onClick={() => setImage(null)} disabled={!!busyText}>
            {t("creator.changePhoto")}
          </Button>
        </div>
        <Cropper image={image} crop={crop} onChange={setCrop} aspect={aspect} onAspect={chooseAspect} />
      </div>
      <div className="space-y-6 rounded-3xl border border-line bg-card p-5 shadow-soft">
        <div>
          <label htmlFor={`${id}-pieces`} className="mb-1 block text-sm font-semibold text-ink-soft">
            {t("creator.pieces")}
          </label>
          <p className="mb-2 font-display text-xl" aria-live="polite">
            {t("creator.piecesValue", { count: grid.count, cols: grid.cols, rows: grid.rows })}
          </p>
          <input
            id={`${id}-pieces`}
            type="range"
            min={0}
            max={options.length - 1}
            step={1}
            value={index}
            onChange={(e) => setOptionIndex(Number(e.target.value))}
            aria-valuetext={t("creator.piecesValue", { count: grid.count, cols: grid.cols, rows: grid.rows })}
            className="w-full accent-accent"
          />
          <div className="mt-1 flex justify-between text-xs text-ink-mute">
            <span>{options[0].count}</span>
            <span>{options[options.length - 1].count}</span>
          </div>
        </div>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={rotate}
            onChange={(e) => setRotate(e.target.checked)}
            className="mt-1 size-5 accent-accent"
          />
          <span>
            <span className="block font-semibold">{t("creator.rotate")}</span>
            <span className="text-sm text-ink-mute">{t("creator.rotateHelp")}</span>
          </span>
        </label>
        {showMode && (
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink-soft">{t("creator.mode")}</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["coop", "versus"] as const).map((m) => (
                <label
                  key={m}
                  className={`cursor-pointer rounded-2xl border p-3 transition has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-accent ${
                    mode === m ? "border-ink bg-ink text-paper" : "border-line hover:border-ink-mute"
                  }`}
                >
                  <input type="radio" name={`${id}-mode`} className="sr-only" checked={mode === m} onChange={() => setMode(m)} />
                  <span className="block font-semibold">{t(`creator.mode.${m}`)}</span>
                  <span className={`text-xs ${mode === m ? "text-paper/80" : "text-ink-mute"}`}>
                    {t(`creator.mode.${m}Help`)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <Button className="w-full" onClick={() => void submit()} disabled={!!busyText}>
          {busyText ?? t("creator.start")}
        </Button>
        {shownError && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {shownError}
          </p>
        )}
      </div>
    </div>
  );
}
