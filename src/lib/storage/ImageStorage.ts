import type { ImageStorageKind } from "@/lib/firebase/config";

/**
 * Almacenamiento de imágenes de las salas. Cambiar de proveedor (Vercel Blob, Supabase Storage…)
 * consiste en implementar esta interfaz y registrarla en `storageFor`; el resto de la app no cambia.
 */
export interface ImageStorage {
  readonly kind: ImageStorageKind;
  upload(
    roomId: string,
    imageId: string,
    blob: Blob,
    meta: { uploader: string; roomOwner: string },
    onProgress?: (fraction: number) => void,
  ): Promise<void>;
  download(roomId: string, imageId: string): Promise<Blob>;
  remove(roomId: string, imageId: string): Promise<void>;
}

export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
