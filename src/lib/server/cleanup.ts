import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getStorage } from "firebase-admin/storage";
import { isStale, staleCutoff } from "./staleness";

function adminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!raw) throw new Error("Falta FIREBASE_SERVICE_ACCOUNT_BASE64");
  const account = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  return initializeApp({
    credential: cert(account),
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || undefined,
  });
}

export interface CleanupResult {
  checked: number;
  deleted: number;
  failed: number;
}

/**
 * Borra las salas sin actividad en `days` días: datos, fotos (RTDB y Storage) e índice.
 * Usa /roomIndex (solo marcas de tiempo) para no descargar salas enteras.
 */
export async function cleanupInactiveRooms(now = Date.now(), days?: number, limit = 200): Promise<CleanupResult> {
  const app = adminApp();
  const db = getDatabase(app);
  const snap = await db.ref("roomIndex").orderByValue().endAt(staleCutoff(now, days)).limitToFirst(limit).get();
  const entries = Object.entries((snap.val() ?? {}) as Record<string, unknown>);
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  let deleted = 0;
  let failed = 0;
  for (const [roomId, last] of entries) {
    if (!isStale(last, now, days)) continue;
    try {
      // La actividad real puede ser más reciente que el índice (se actualiza con throttling).
      const activity = (await db.ref(`rooms/${roomId}/activity`).get()).val();
      if (typeof activity === "number" && !isStale(activity, now, days)) {
        await db.ref(`roomIndex/${roomId}`).set(activity);
        continue;
      }
      if (bucketName && process.env.NEXT_PUBLIC_IMAGE_STORAGE === "firebase") {
        await getStorage(app).bucket(bucketName).deleteFiles({ prefix: `rooms/${roomId}/` }).catch(() => {});
      }
      await db.ref().update({ [`rooms/${roomId}`]: null, [`images/${roomId}`]: null, [`roomIndex/${roomId}`]: null });
      deleted++;
    } catch (e) {
      console.error("cleanup", roomId, e);
      failed++;
    }
  }
  return { checked: entries.length, deleted, failed };
}
