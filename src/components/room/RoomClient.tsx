"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { useT } from "@/i18n";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { RoomSession } from "@/lib/firebase/room";
import { checkRoom, deleteRoom, joinRoom, removeMember, startPuzzle, touchActivity, type RoomAccess } from "@/lib/firebase/rooms";
import type { RoomInfo } from "@/lib/firebase/types";
import { usePref } from "@/lib/prefs";
import { isValidRoomId } from "@/lib/puzzle/rng";
import { cleanName, PLAYER_COLORS } from "@/lib/sanitize";
import { loadRoomImage } from "@/lib/storage";
import { MenuItem } from "../game/GamePlay";
import { HeaderButton, HeaderLink } from "../game/HeaderButton";
import { ProfileFields, type Profile } from "../ProfileFields";
import { PuzzleCreator, type CreatedPuzzle } from "../PuzzleCreator";
import { Button } from "../ui/Button";
import { IconChat, IconHome, IconLogout, IconPuzzle, IconShare, IconTrash, IconUsers } from "../ui/icons";
import { ChatPanel } from "./ChatPanel";
import { ConfirmDialog } from "./ConfirmDialog";
import { CoopGame } from "./CoopGame";
import { PlayersPanel } from "./PlayersPanel";
import { ShareDialog } from "./ShareDialog";
import { VersusGame } from "./VersusGame";

function Screen({ children }: { children: ReactNode }) {
  return (
    <main className="paper-grain grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md animate-fade-up">{children}</div>
    </main>
  );
}

function Message({ text, action = true }: { text: string; action?: boolean }) {
  const t = useT();
  return (
    <Screen>
      <div className="rounded-[2rem] border border-line bg-card p-8 text-center shadow-soft">
        <p className="font-display text-2xl">{text}</p>
        {action && (
          <Link href="/" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 font-semibold text-white">
            <IconHome /> {t("room.home")}
          </Link>
        )}
      </div>
    </Screen>
  );
}

export function RoomClient({ roomId }: { roomId: string }) {
  const t = useT();
  const [access, setAccess] = useState<RoomAccess | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(() => {
    if (!isFirebaseConfigured || !isValidRoomId(roomId)) return;
    checkRoom(roomId)
      .then(setAccess)
      .catch((e) => {
        console.error(e);
        setError(true);
      });
  }, [roomId]);

  useEffect(refresh, [refresh]);

  if (!isFirebaseConfigured) return <Message text={t("home.noFirebase")} />;
  if (!isValidRoomId(roomId)) return <Message text={t("room.notFound")} />;
  if (error) return <Message text={t("room.error")} />;
  if (!access)
    return (
      <Screen>
        <p role="status" className="animate-pulse-soft text-center font-display text-xl text-ink-soft">
          {t("room.connecting")}
        </p>
      </Screen>
    );
  if (access.status === "missing") return <Message text={t("room.notFound")} />;
  if (access.status === "guest") return <JoinGate roomId={roomId} info={access.info} onJoined={refresh} />;
  return <RoomInside roomId={roomId} uid={access.uid} info={access.info} />;
}

function JoinGate({ roomId, info, onJoined }: { roomId: string; info: RoomInfo; onJoined: () => void }) {
  const t = useT();
  const [profile, setProfile] = usePref<Profile>("profile", { name: "", color: PLAYER_COLORS[1] });
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [full, setFull] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const name = cleanName(profile.name);
    if (!name) return setNameError(t("profile.nameRequired"));
    setBusy(true);
    setProfile({ name, color: profile.color });
    try {
      const res = await joinRoom(roomId, info, { name, color: profile.color });
      if (res === "full") setFull(true);
      else onJoined();
    } finally {
      setBusy(false);
    }
  };

  if (full) return <Message text={t("room.full")} />;

  return (
    <Screen>
      <form onSubmit={submit} className="rounded-[2rem] border border-line bg-card p-7 shadow-soft">
        <p className="mb-1 font-mono text-sm tracking-widest text-ink-mute">{t("app.name")}</p>
        <h1 className="mb-6 font-display text-3xl font-semibold">{t("room.joinTitle")}</h1>
        <ProfileFields value={profile} onChange={setProfile} error={nameError} />
        <Button type="submit" className="mt-6 w-full" disabled={busy}>
          {busy ? t("room.joining") : t("room.joinCta")}
        </Button>
      </form>
    </Screen>
  );
}

function RoomInside({ roomId, uid, info }: { roomId: string; uid: string; info: RoomInfo }) {
  const t = useT();
  const router = useRouter();
  const session = useMemo(() => new RoomSession(roomId, uid), [roomId, uid]);
  useEffect(() => {
    session.start();
    void touchActivity(roomId, true);
    return () => session.stop();
  }, [session, roomId]);
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);

  const [panel, setPanel] = useState<"players" | "chat" | null>(null);
  const [share, setShare] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<"new" | "delete" | "leave" | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [seenChat, setSeenChat] = useState(0);
  const [image, setImage] = useState<{ id: string; bitmap: ImageBitmap } | null>(null);
  const [imageErrorId, setImageErrorId] = useState<string | null>(null);
  const [shareDismissed, setShareDismissed] = useState(false);

  const puzzle = state.puzzle;
  const imageId = puzzle?.image.id;
  const imageKind = puzzle?.image.storage;

  // Foto del puzzle: caché local o descarga.
  useEffect(() => {
    if (!imageId || !imageKind) return;
    let alive = true;
    let bmp: ImageBitmap | null = null;
    loadRoomImage(roomId, imageId, imageKind)
      .then((blob) => createImageBitmap(blob))
      .then((b) => {
        bmp = b;
        if (alive) setImage({ id: imageId, bitmap: b });
        else b.close();
      })
      .catch((e) => {
        console.error(e);
        if (alive) setImageErrorId(imageId);
      });
    return () => {
      alive = false;
      bmp?.close();
    };
  }, [roomId, imageId, imageKind]);

  const imageError = !!imageId && imageErrorId === imageId;
  // Primera visita a una sala recién creada: el diálogo de invitación se abre solo.
  const autoShare = puzzle === null && Object.keys(state.members).length === 1 && info.createdBy === uid && !shareDismissed;
  const toggleChat = () => {
    setSeenChat(state.chat.length);
    setPanel(panel === "chat" ? null : "chat");
  };

  const create = async (p: CreatedPuzzle) => {
    setUploading(t("creator.uploading", { pct: 0 }));
    setUploadError(null);
    try {
      await startPuzzle(
        roomId,
        info,
        { blob: p.image.blob, width: p.image.width, height: p.image.height, cols: p.cols, rows: p.rows, rotate: p.rotate, mode: p.mode },
        puzzle ?? null,
        (f) => setUploading(t("creator.uploading", { pct: Math.round(f * 100) })),
      );
      setCreating(false);
    } catch (e) {
      console.error(e);
      setUploadError(t("creator.error.upload"));
    } finally {
      setUploading(null);
    }
  };

  const doDelete = async () => {
    setConfirm(null);
    await deleteRoom(roomId);
    router.push("/");
  };

  const doLeave = async () => {
    setConfirm(null);
    const me = state.members[uid];
    if (me) await removeMember(roomId, uid, me.slot);
    router.push("/");
  };

  if (state.gone) return <Message text={t("room.deleted")} />;

  const unread = panel === "chat" ? 0 : Math.max(0, state.chat.length - seenChat);
  const isHost = info.createdBy === uid;

  const headerLeft = (
    <>
      <HeaderLink href="/" label={t("room.home")}>
        <IconHome />
      </HeaderLink>
      <HeaderButton label={t("room.share")} onClick={() => setShare(true)}>
        <IconShare />
      </HeaderButton>
      {!state.connected && (
        <span role="status" className="glass rounded-full px-3 py-2 text-xs font-semibold">
          {t("room.offline")}
        </span>
      )}
    </>
  );

  const headerRight = (
    <>
      <div className="mr-1 hidden -space-x-2 sm:flex" aria-hidden>
        {Object.entries(state.members)
          .filter(([u]) => state.presence[u]?.on)
          .slice(0, 5)
          .map(([u, m]) => (
            <span
              key={u}
              title={m.name}
              className="grid size-8 place-items-center rounded-full border-2 border-[#2a1e18] text-xs font-bold text-white"
              style={{ background: m.color }}
            >
              {m.name.slice(0, 1).toUpperCase()}
            </span>
          ))}
      </div>
      <HeaderButton label={t("room.players")} onClick={() => setPanel(panel === "players" ? null : "players")} expanded={panel === "players"}>
        <IconUsers />
      </HeaderButton>
      <HeaderButton
        label={unread ? `${t("chat.open")} · ${t("chat.unread", { n: unread })}` : t("chat.open")}
        onClick={toggleChat}
        badge={unread}
        expanded={panel === "chat"}
      >
        <IconChat />
      </HeaderButton>
    </>
  );

  const menu = (
    <>
      <MenuItem onClick={() => setConfirm("new")} icon={<IconPuzzle />}>
        {t("tools.newPuzzle")}
      </MenuItem>
      {isHost ? (
        <MenuItem onClick={() => setConfirm("delete")} icon={<IconTrash />}>
          {t("room.delete")}
        </MenuItem>
      ) : (
        <MenuItem onClick={() => setConfirm("leave")} icon={<IconLogout />}>
          {t("room.leave")}
        </MenuItem>
      )}
    </>
  );

  const overlays = (
    <>
      <PlayersPanel
        open={panel === "players"}
        onClose={() => setPanel(null)}
        members={state.members}
        presence={state.presence}
        me={uid}
        hostUid={info.createdBy}
        onKick={(u, slot) => void removeMember(roomId, u, slot)}
        onLeave={() => setConfirm("leave")}
        onDelete={() => setConfirm("delete")}
      />
      <ChatPanel open={panel === "chat"} onClose={toggleChat} messages={state.chat} me={uid} onSend={(m) => session.sendChat(m)} />
      <ShareDialog
        roomId={roomId}
        open={share || autoShare}
        onClose={() => {
          setShare(false);
          setShareDismissed(true);
        }}
      />
      <ConfirmDialog
        open={confirm === "new"}
        title={t("tools.newPuzzle")}
        body={t("room.newPuzzleConfirm")}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          setCreating(true);
        }}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        title={t("room.delete")}
        body={t("room.deleteConfirm")}
        danger
        onClose={() => setConfirm(null)}
        onConfirm={() => void doDelete()}
      />
      <ConfirmDialog open={confirm === "leave"} title={t("room.leave")} body={t("room.leaveConfirm")} onClose={() => setConfirm(null)} onConfirm={() => void doLeave()} />
    </>
  );

  // Sin puzzle (o eligiendo uno nuevo): pantalla de creación.
  if (puzzle === null || creating) {
    return (
      <main className="paper-grain min-h-dvh px-4 py-5 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex items-center justify-between gap-3">
            <Link href="/" className="inline-flex items-center gap-2 font-semibold text-ink-soft hover:text-ink">
              <IconHome /> {t("app.name")}
            </Link>
            <div className="flex gap-2">
              {creating && (
                <Button variant="ghost" onClick={() => setCreating(false)}>
                  {t("common.cancel")}
                </Button>
              )}
              <Button variant="secondary" onClick={() => setShare(true)}>
                <IconShare /> {t("room.share")}
              </Button>
            </div>
          </div>
          {!creating && (
            <div className="mb-6">
              <h1 className="font-display text-3xl font-semibold">{t("room.noPuzzle")}</h1>
              <p className="text-ink-soft">{t("room.noPuzzleBody")}</p>
            </div>
          )}
          <PuzzleCreator showMode busy={uploading} error={uploadError} onCreate={create} />
        </div>
        {overlays}
      </main>
    );
  }

  if (puzzle === undefined || !image || image.id !== puzzle.image.id) {
    return (
      <Screen>
        <p role="status" className={`text-center font-display text-xl text-ink-soft ${imageError ? "" : "animate-pulse-soft"}`}>
          {imageError ? t("room.error") : puzzle === undefined ? t("room.connecting") : t("board.loadingImage")}
        </p>
        {overlays}
      </Screen>
    );
  }

  const common = { session, state, uid, puzzle, image: image.bitmap, headerLeft, headerRight, menu, onNewPuzzle: () => setCreating(true) };
  return puzzle.mode === "versus" ? (
    <VersusGame key={puzzle.id} {...common}>
      {overlays}
    </VersusGame>
  ) : (
    <CoopGame key={puzzle.id} {...common}>
      {overlays}
    </CoopGame>
  );
}
