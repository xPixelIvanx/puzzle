"use client";

import { useState } from "react";
import { useT } from "@/i18n";
import { formatRoomCode } from "@/lib/puzzle/rng";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { IconCopy, IconShare } from "../ui/icons";

export function ShareDialog({ roomId, open, onClose }: { roomId: string; open: boolean; onClose: () => void }) {
  const t = useT();
  const [copied, setCopied] = useState<string | null>(null);
  const code = formatRoomCode(roomId);
  // Solo se usan con el diálogo abierto (en el cliente), así que no afectan a la hidratación.
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/r/${roomId}`;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* sin portapapeles: el texto queda seleccionable */
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={t("room.shareTitle")}>
      <p className="mb-4 text-ink-soft">{t("room.shareBody")}</p>
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-2xl border border-line bg-white p-2 pl-4">
          <span className="min-w-0 flex-1 truncate font-mono text-sm select-all">{url}</span>
          <Button variant="secondary" className="min-h-10 px-3" onClick={() => void copy(url, "url")}>
            <IconCopy /> {copied === "url" ? t("common.copied") : t("common.copy")}
          </Button>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-line bg-white p-2 pl-4">
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold uppercase tracking-wider text-ink-mute">{t("room.code")}</span>
            <span className="font-mono text-lg font-semibold tracking-widest select-all">{code}</span>
          </span>
          <Button variant="secondary" className="min-h-10 px-3" onClick={() => void copy(code, "code")}>
            <IconCopy /> {copied === "code" ? t("common.copied") : t("common.copy")}
          </Button>
        </div>
        {canShare && (
          <Button
            className="w-full"
            onClick={() => void navigator.share({ title: t("app.name"), text: t("room.shareTitle"), url }).catch(() => {})}
          >
            <IconShare /> {t("room.shareNative")}
          </Button>
        )}
      </div>
    </Dialog>
  );
}
