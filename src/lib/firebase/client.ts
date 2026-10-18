"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, onAuthStateChanged, signInAnonymously, type Auth, type User } from "firebase/auth";
import { connectDatabaseEmulator, getDatabase, onValue, ref, type Database } from "firebase/database";
import { firebaseConfig, isFirebaseConfigured, useEmulators } from "./config";

interface Fb {
  app: FirebaseApp;
  auth: Auth;
  db: Database;
}

let fb: Fb | null = null;
let serverOffset = 0;

export function getFirebase(): Fb {
  if (fb) return fb;
  if (!isFirebaseConfigured) throw new Error("Firebase no está configurado (ver SETUP.md)");
  const config = useEmulators
    ? {
        ...firebaseConfig,
        apiKey: firebaseConfig.apiKey || "demo-key",
        projectId: firebaseConfig.projectId || "demo-puzzle-juntos",
        databaseURL: firebaseConfig.databaseURL || "http://127.0.0.1:9000?ns=demo-puzzle-juntos-default-rtdb",
        storageBucket: firebaseConfig.storageBucket || "demo-puzzle-juntos.appspot.com",
      }
    : firebaseConfig;
  const app = getApps().length ? getApp() : initializeApp(config);
  const auth = getAuth(app);
  const db = getDatabase(app);
  if (useEmulators) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectDatabaseEmulator(db, "127.0.0.1", 9000);
  }
  // Desfase entre el reloj local y el del servidor (cuenta regresiva, caducidad de bloqueos).
  onValue(ref(db, ".info/serverTimeOffset"), (s) => {
    serverOffset = Number(s.val()) || 0;
  });
  fb = { app, auth, db };
  return fb;
}

/** Hora estimada del servidor en ms. */
export function serverNow(): number {
  return Date.now() + serverOffset;
}

let userPromise: Promise<User> | null = null;

/** Inicia sesión anónima (persistente en este navegador) y devuelve el usuario. */
export function ensureUser(): Promise<User> {
  if (userPromise) return userPromise;
  const { auth } = getFirebase();
  userPromise = new Promise<User>((resolve, reject) => {
    const off = onAuthStateChanged(
      auth,
      (u) => {
        if (u) {
          off();
          resolve(u);
        } else {
          signInAnonymously(auth).catch((e) => {
            off();
            userPromise = null;
            reject(e);
          });
        }
      },
      (e) => {
        userPromise = null;
        reject(e);
      },
    );
  });
  return userPromise;
}

export function isPermissionDenied(e: unknown): boolean {
  const msg = String((e as { message?: string; code?: string })?.code ?? (e as Error)?.message ?? e);
  return /permission[_ -]denied/i.test(msg);
}
