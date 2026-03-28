import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Only initialize if API key is present (prevents build-time crash before credentials are set)
let app: FirebaseApp | null = null;
if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
}

export const auth = app ? getAuth(app) : (null as unknown as Auth);
export const googleProvider = new GoogleAuthProvider();
