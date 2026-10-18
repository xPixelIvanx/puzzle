"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useT } from "@/i18n";
import { IconX } from "../ui/icons";

/** Panel lateral (escritorio) / hoja inferior (móvil) sobre el tablero. */
export function SidePanel({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const t = useT();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <aside
      ref={ref}
      tabIndex={-1}
      aria-label={title}
      className="absolute inset-x-2 bottom-2 z-10 flex max-h-[70dvh] animate-fade-up flex-col overflow-hidden rounded-3xl border border-line bg-card text-ink shadow-float outline-none sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-16 sm:max-h-[calc(100dvh-6rem)] sm:w-[22rem] [margin-bottom:env(safe-area-inset-bottom)]"
    >
      <header className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="-mr-2 grid size-10 place-items-center rounded-full text-ink-soft hover:bg-paper-2"
        >
          <IconX />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer && <div className="border-t border-line p-3">{footer}</div>}
    </aside>
  );
}
