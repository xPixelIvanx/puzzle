"use client";

import { useT } from "@/i18n";
import type { Member, Presence } from "@/lib/firebase/types";
import { Button } from "../ui/Button";
import { IconLogout, IconTrash, IconX } from "../ui/icons";
import { SidePanel } from "./SidePanel";

export function PlayersPanel({
  open,
  onClose,
  members,
  presence,
  me,
  hostUid,
  onKick,
  onLeave,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  members: Record<string, Member>;
  presence: Record<string, Presence>;
  me: string;
  hostUid: string;
  onKick: (uid: string, slot: number) => void;
  onLeave: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const list = Object.entries(members).sort((a, b) => a[1].slot - b[1].slot);
  const isHost = me === hostUid;
  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title={t("room.players")}
      footer={
        <div className="flex flex-col gap-2">
          {!isHost && (
            <Button variant="secondary" onClick={onLeave}>
              <IconLogout /> {t("room.leave")}
            </Button>
          )}
          {isHost && (
            <Button variant="danger" onClick={onDelete}>
              <IconTrash /> {t("room.delete")}
            </Button>
          )}
        </div>
      }
    >
      <ul className="divide-y divide-line">
        {list.map(([uid, m]) => {
          const online = !!presence[uid]?.on;
          return (
            <li key={uid} className="flex items-center gap-3 px-5 py-3">
              <span className="relative size-9 shrink-0 rounded-full border-2 border-white shadow-soft" style={{ background: m.color }}>
                <span
                  className={`absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-card ${online ? "bg-[#3f9b5a]" : "bg-ink-mute/50"}`}
                  aria-hidden
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {m.name}
                  {uid === me && <span className="font-normal text-ink-mute"> ({t("common.you")})</span>}
                </span>
                <span className="text-sm text-ink-mute">
                  {online ? t("room.online") : t("room.offlinePlayer")}
                  {uid === hostUid && ` · ${t("room.host")}`}
                </span>
              </span>
              {isHost && uid !== me && (
                <button
                  type="button"
                  onClick={() => onKick(uid, m.slot)}
                  aria-label={`${t("room.kick")}: ${m.name}`}
                  title={t("room.kick")}
                  className="grid size-10 place-items-center rounded-full text-ink-soft hover:bg-paper-2"
                >
                  <IconX />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </SidePanel>
  );
}
