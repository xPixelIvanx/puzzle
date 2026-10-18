"use client";

import { get, ref, remove, serverTimestamp, set, update } from "firebase/database";
import { createPuzzleDef, newRoomId, newSecureId, randomSeed, scatter } from "@/lib/puzzle";
import { cleanColor, cleanName } from "@/lib/sanitize";
import { cacheRoomImage, storageFor } from "@/lib/storage";
import { ensureUser, getFirebase, isPermissionDenied } from "./client";
import { imageStorageKind, type ImageStorageKind } from "./config";
import { groupKey, P } from "./paths";
import type { GameMode, Member, PuzzleRecord, RoomInfo } from "./types";

export const MAX_PLAYERS_LIMIT = 8;

export interface ProfileInput {
  name: string;
  color: string;
}

function cleanProfile(p: ProfileInput) {
  return { name: cleanName(p.name) || "?", color: cleanColor(p.color) };
}

/** Crea la sala con quien la crea como primer miembro. Devuelve el roomId. */
export async function createRoom(profile: ProfileInput, maxPlayers: number): Promise<string> {
  const user = await ensureUser();
  const { db } = getFirebase();
  const max = Math.min(MAX_PLAYERS_LIMIT, Math.max(2, Math.round(maxPlayers)));
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = newRoomId();
    try {
      await set(ref(db, P.room(id)), {
        info: { createdBy: user.uid, createdAt: serverTimestamp(), maxPlayers: max },
        activity: serverTimestamp(),
        slots: { 0: user.uid },
        members: { [user.uid]: { ...cleanProfile(profile), slot: 0, joinedAt: serverTimestamp() } },
      });
      await set(ref(db, P.roomIndex(id)), serverTimestamp());
      return id;
    } catch (e) {
      // Colisión de id (2⁻⁶⁰…) → las reglas rechazan sobrescribir una sala existente.
      if (!isPermissionDenied(e)) throw e;
    }
  }
  throw new Error("No se pudo crear la sala");
}

export type RoomAccess =
  | { status: "member"; uid: string; info: RoomInfo; member: Member }
  | { status: "guest"; uid: string; info: RoomInfo }
  | { status: "missing"; uid: string };

/** ¿Existe la sala y soy miembro? (solo `info` y mi propio miembro son legibles sin ser miembro) */
export async function checkRoom(roomId: string): Promise<RoomAccess> {
  const user = await ensureUser();
  const { db } = getFirebase();
  let info: RoomInfo | null = null;
  try {
    info = (await get(ref(db, P.info(roomId)))).val() as RoomInfo | null;
  } catch (e) {
    if (!isPermissionDenied(e)) throw e;
  }
  if (!info) return { status: "missing", uid: user.uid };
  const member = (await get(ref(db, P.member(roomId, user.uid)))).val() as Member | null;
  return member ? { status: "member", uid: user.uid, info, member } : { status: "guest", uid: user.uid, info };
}

/** Ocupa el primer hueco libre. Las reglas impiden ocupar uno ocupado o pasar de maxPlayers. */
export async function joinRoom(roomId: string, info: RoomInfo, profile: ProfileInput): Promise<"joined" | "full"> {
  const user = await ensureUser();
  const { db } = getFirebase();
  // El hueco 0 es siempre del creador: empezar por el 1 evita un intento fallido.
  const order = [...Array.from({ length: info.maxPlayers - 1 }, (_, i) => i + 1), 0];
  for (const n of order) {
    try {
      await update(ref(db), {
        [P.slot(roomId, n)]: user.uid,
        [P.member(roomId, user.uid)]: { ...cleanProfile(profile), slot: n, joinedAt: serverTimestamp() },
      });
      await touchActivity(roomId);
      return "joined";
    } catch (e) {
      if (!isPermissionDenied(e)) throw e;
    }
  }
  return "full";
}

export async function updateProfile(roomId: string, uid: string, profile: ProfileInput) {
  const { db } = getFirebase();
  const p = cleanProfile(profile);
  await update(ref(db, P.member(roomId, uid)), { name: p.name, color: p.color });
}

/** Saca a un miembro (uno mismo, o el anfitrión a otro) liberando su hueco. */
export async function removeMember(roomId: string, uid: string, slot: number) {
  const { db } = getFirebase();
  await update(ref(db), {
    [P.member(roomId, uid)]: null,
    [P.slot(roomId, slot)]: null,
    [P.presenceOf(roomId, uid)]: null,
    [P.cursor(roomId, uid)]: null,
  });
}

let lastTouch = 0;

/** Marca actividad (para la limpieza a 60 días). Como mucho cada 5 minutos. */
export async function touchActivity(roomId: string, force = false) {
  const now = Date.now();
  if (!force && now - lastTouch < 5 * 60_000) return;
  lastTouch = now;
  const { db } = getFirebase();
  try {
    await update(ref(db), { [P.activity(roomId)]: serverTimestamp(), [P.roomIndex(roomId)]: serverTimestamp() });
  } catch {
    /* no crítico */
  }
}

/** Borra la sala, sus imágenes y su índice (solo el creador). */
export async function deleteRoom(roomId: string) {
  const { db } = getFirebase();
  const images = ((await get(ref(db, P.roomImages(roomId)))).val() ?? {}) as Record<string, { storage: ImageStorageKind }>;
  await Promise.all(
    Object.entries(images).map(async ([imageId, meta]) => {
      try {
        await (await storageFor(meta.storage)).remove(roomId, imageId);
      } catch (e) {
        console.warn("No se pudo borrar la imagen", imageId, e);
      }
    }),
  );
  await remove(ref(db, P.imagesOfRoom(roomId))).catch(() => {});
  await remove(ref(db, P.roomIndex(roomId))).catch(() => {});
  await remove(ref(db, P.room(roomId)));
}

export interface NewPuzzle {
  blob: Blob;
  width: number;
  height: number;
  cols: number;
  rows: number;
  rotate: boolean;
  mode: GameMode;
}

/** Sube la foto y reemplaza el puzzle de la sala (con su dispersión inicial si es cooperativo). */
export async function startPuzzle(
  roomId: string,
  info: RoomInfo,
  p: NewPuzzle,
  previous: PuzzleRecord | null,
  onProgress?: (f: number) => void,
): Promise<void> {
  const user = await ensureUser();
  const { db } = getFirebase();
  const imageId = newSecureId();
  const storage = await storageFor(imageStorageKind);
  await update(ref(db, P.roomImages(roomId)), { [imageId]: { storage: storage.kind, by: user.uid, at: serverTimestamp() } });
  await storage.upload(roomId, imageId, p.blob, { uploader: user.uid, roomOwner: info.createdBy }, onProgress);
  await cacheRoomImage(roomId, imageId, p.blob);

  const seed = randomSeed();
  const puzzle: Omit<PuzzleRecord, "at"> & { at: object } = {
    id: newSecureId(12),
    mode: p.mode,
    image: { id: imageId, storage: storage.kind, w: p.width, h: p.height },
    cols: p.cols,
    rows: p.rows,
    seed,
    rotate: p.rotate,
    by: user.uid,
    at: serverTimestamp(),
    elapsed: 0,
  };
  const updates: Record<string, unknown> = {
    [P.puzzle(roomId)]: puzzle,
    [P.groups(roomId)]: null,
    [P.stats(roomId)]: null,
    [P.versus(roomId)]: null,
  };
  if (p.mode === "coop") {
    const def = createPuzzleDef({ cols: p.cols, rows: p.rows, aspect: p.height / p.width, seed, rotate: p.rotate });
    const groups: Record<string, { x: number; y: number; r: number }> = {};
    for (const [k, g] of Object.entries(scatter(def, seed))) {
      groups[groupKey(Number(k))] = { x: round(g.x), y: round(g.y), r: g.r };
    }
    updates[P.groups(roomId)] = groups;
  } else {
    updates[P.versus(roomId)] = { round: { n: 1, seed: randomSeed(), by: user.uid } };
  }
  await update(ref(db), updates);
  void touchActivity(roomId, true);

  // La foto anterior ya no se usa: intentar borrarla (si no hay permiso, la limpieza la quitará).
  if (previous?.image?.id && previous.image.id !== imageId) {
    try {
      await (await storageFor(previous.image.storage)).remove(roomId, previous.image.id);
      await remove(ref(db, `${P.roomImages(roomId)}/${previous.image.id}`));
    } catch {
      /* no crítico */
    }
  }
}

/** Redondeo para no enviar decimales inútiles (1e-5 del ancho del puzzle ≈ 0,02 px a 2048 px). */
export function round(v: number): number {
  return Math.round(v * 1e5) / 1e5;
}
