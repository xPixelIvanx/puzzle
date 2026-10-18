import { get, ref, remove, serverTimestamp, set } from "firebase/database";
import { getFirebase } from "@/lib/firebase/client";
import { P } from "@/lib/firebase/paths";
import { ALLOWED_MIME, MAX_IMAGE_BYTES, type ImageStorage } from "./ImageStorage";

/** Bytes por trozo antes de base64 (384 KiB → 512 KiB en base64). */
const CHUNK = 384 * 1024;

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Imágenes guardadas en Realtime Database, en trozos base64. Funciona en el plan gratuito y las
 * reglas permiten leerlas solo a miembros de la sala.
 */
export const rtdbImageStorage: ImageStorage = {
  kind: "rtdb",

  async upload(roomId, imageId, blob, meta, onProgress) {
    if (!(ALLOWED_MIME as readonly string[]).includes(blob.type)) throw new Error("tipo no permitido");
    if (blob.size > MAX_IMAGE_BYTES) throw new Error("demasiado grande");
    const { db } = getFirebase();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const n = Math.ceil(bytes.length / CHUNK);
    const base = P.imageData(roomId, imageId);
    await set(ref(db, `${base}/meta`), { by: meta.uploader, mime: blob.type, bytes: bytes.length, n, at: serverTimestamp() });
    for (let i = 0; i < n; i++) {
      await set(ref(db, `${base}/c/${i}`), bytesToBase64(bytes.subarray(i * CHUNK, (i + 1) * CHUNK)));
      onProgress?.((i + 1) / n);
    }
  },

  async download(roomId, imageId) {
    const { db } = getFirebase();
    const base = P.imageData(roomId, imageId);
    const [metaSnap, chunksSnap] = await Promise.all([get(ref(db, `${base}/meta`)), get(ref(db, `${base}/c`))]);
    const meta = metaSnap.val() as { mime: string; n: number } | null;
    const chunks = chunksSnap.val() as string[] | Record<string, string> | null;
    if (!meta || !chunks) throw new Error("imagen no encontrada");
    const parts: Uint8Array[] = [];
    for (let i = 0; i < meta.n; i++) {
      const c = (chunks as Record<string, string>)[i];
      if (typeof c !== "string") throw new Error("imagen incompleta");
      parts.push(base64ToBytes(c));
    }
    return new Blob(parts as BlobPart[], { type: meta.mime });
  },

  async remove(roomId, imageId) {
    const { db } = getFirebase();
    await remove(ref(db, P.imageData(roomId, imageId)));
  },
};
