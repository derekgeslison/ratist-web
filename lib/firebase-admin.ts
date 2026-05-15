import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getStorage, type Storage } from "firebase-admin/storage";
import { getDatabase, type Database } from "firebase-admin/database";

let _adminApp: App | null = null;
let _adminAuth: Auth | null = null;
let _adminStorage: Storage | null = null;
let _adminDatabase: Database | null = null;

export function getAdminApp(): App {
  if (_adminApp) return _adminApp;
  if (getApps().length > 0) {
    _adminApp = getApps()[0];
    return _adminApp;
  }

  _adminApp = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    // Required for adminDatabase below — without this, getDatabase()
    // throws "Can't determine Firebase Database URL." Reuses the same
    // URL the client SDK reads from NEXT_PUBLIC_FIREBASE_DATABASE_URL.
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  });

  return _adminApp;
}

// Lazy getter — only initializes when first called at runtime, not at build time
export const adminAuth: Auth = new Proxy({} as Auth, {
  get(_target, prop) {
    if (!_adminAuth) {
      _adminAuth = getAuth(getAdminApp());
    }
    return (_adminAuth as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const adminStorage: Storage = new Proxy({} as Storage, {
  get(_target, prop) {
    if (!_adminStorage) {
      _adminStorage = getStorage(getAdminApp());
    }
    return (_adminStorage as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// RTDB admin handle. Used server-side to mirror screening-room
// participants from Postgres into RTDB so the rules can gate
// read/write on participant membership without an HTTP roundtrip.
// See lib/screening-rtdb.ts for the helpers consumers should use.
export const adminDatabase: Database = new Proxy({} as Database, {
  get(_target, prop) {
    if (!_adminDatabase) {
      _adminDatabase = getDatabase(getAdminApp());
    }
    return (_adminDatabase as unknown as Record<string | symbol, unknown>)[prop];
  },
});
