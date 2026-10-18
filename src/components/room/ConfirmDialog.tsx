"use client";

import { useT } from "@/i18n";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

export function ConfirmDialog({
  open,
  title,
  body,
  danger = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <p className="text-ink-soft">{body}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
          {t("common.confirm")}
        </Button>
      </div>
    </Dialog>
  );
}
