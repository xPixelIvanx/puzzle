/** Configuración pública de Firebase (variables NEXT_PUBLIC_*). No contiene secretos. */
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
};

export const useEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "1";

/** ¿Hay configuración suficiente para el modo en línea? */
export const isFirebaseConfigured =
  useEmulators || (!!firebaseConfig.apiKey && !!firebaseConfig.databaseURL && !!firebaseConfig.projectId);

export type ImageStorageKind = "rtdb" | "firebase";

export const imageStorageKind: ImageStorageKind =
  process.env.NEXT_PUBLIC_IMAGE_STORAGE === "firebase" ? "firebase" : "rtdb";
