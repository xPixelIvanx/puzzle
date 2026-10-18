import { imageStorageKind, type ImageStorageKind } from "@/lib/firebase/config";
import type { ImageStorage } from "./ImageStorage";
import { idbGet, idbSet } from "./localDb";

export type { ImageStorage } from "./ImageStorage";

/** Adaptador según el tipo guardado en la sala (las salas antiguas conservan su proveedor). */
export async function storageFor(kind: ImageStorageKind = imageStorageKind): Promise<ImageStorage> {
  if (kind === "firebase") return (await import("./firebaseImageStorage")).firebaseImageStorage;
  return (await import("./rtdbImageStorage")).rtdbImageStorage;
}

/** Descarga la imagen de una sala usando la caché local (IndexedDB) para no repetir descargas. */
export async function loadRoomImage(roomId: string, imageId: string, kind: ImageStorageKind): Promise<Blob> {
  const key = `img:${roomId}:${imageId}`;
  const cached = await idbGet<Blob>(key);
  if (cached instanceof Blob && cached.size > 0) return cached;
  const blob = await (await storageFor(kind)).download(roomId, imageId);
  void idbSet(key, blob);
  return blob;
}

export async function cacheRoomImage(roomId: string, imageId: string, blob: Blob) {
  await idbSet(`img:${roomId}:${imageId}`, blob);
}
