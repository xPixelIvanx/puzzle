import {
  connectStorageEmulator,
  deleteObject,
  getBlob,
  getStorage,
  ref,
  uploadBytesResumable,
  type FirebaseStorage,
} from "firebase/storage";
import { getFirebase } from "@/lib/firebase/client";
import { useEmulators } from "@/lib/firebase/config";
import { ALLOWED_MIME, MAX_IMAGE_BYTES, type ImageStorage } from "./ImageStorage";

let storage: FirebaseStorage | null = null;

function st(): FirebaseStorage {
  if (storage) return storage;
  storage = getStorage(getFirebase().app);
  if (useEmulators) connectStorageEmulator(storage, "127.0.0.1", 9199);
  return storage;
}

const path = (roomId: string, imageId: string) => `rooms/${roomId}/${imageId}`;

/**
 * Cloud Storage for Firebase (requiere plan Blaze y CORS, ver SETUP.md). Las reglas de Storage no
 * pueden consultar RTDB: la protección es la ruta no adivinable + listado prohibido + auth.
 * Se descarga con getBlob (autenticado), nunca con URLs públicas con token.
 */
export const firebaseImageStorage: ImageStorage = {
  kind: "firebase",

  upload(roomId, imageId, blob, meta, onProgress) {
    if (!(ALLOWED_MIME as readonly string[]).includes(blob.type)) return Promise.reject(new Error("tipo no permitido"));
    if (blob.size > MAX_IMAGE_BYTES) return Promise.reject(new Error("demasiado grande"));
    return new Promise((resolve, reject) => {
      const task = uploadBytesResumable(ref(st(), path(roomId, imageId)), blob, {
        contentType: blob.type,
        cacheControl: "private, max-age=31536000",
        customMetadata: { owner: meta.uploader, roomOwner: meta.roomOwner },
      });
      task.on(
        "state_changed",
        (s) => onProgress?.(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0),
        reject,
        () => resolve(),
      );
    });
  },

  download(roomId, imageId) {
    return getBlob(ref(st(), path(roomId, imageId)));
  },

  async remove(roomId, imageId) {
    await deleteObject(ref(st(), path(roomId, imageId)));
  },
};
