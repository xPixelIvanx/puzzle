"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useT } from "@/i18n";
import { IconX } from "./icons";

/** Diálogo modal accesible sobre <dialog> nativo (foco atrapado, Escape, fondo inerte). */
export function Dialog({
  open,
  onClose,
  title,
  children,
  className = "",
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const t = useT();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(e) => {
        if (dismissible && e.target === ref.current) onClose();
      }}
      className={`m-auto w-[min(92vw,30rem)] rounded-3xl border border-line bg-card p-0 text-ink shadow-float backdrop:bg-[#1e1612]/55 backdrop:backdrop-blur-[2px] open:animate-pop ${className}`}
    >
      {open && (
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="font-display text-2xl font-semibold leading-tight">{title}</h2>
            {dismissible && (
              <button
                type="button"
                onClick={onClose}
                aria-label={t("common.close")}
                className="-m-2 grid size-10 place-items-center rounded-full text-ink-soft hover:bg-paper-2"
              >
                <IconX />
              </button>
            )}
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
