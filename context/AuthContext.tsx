"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updateProfile,
  type User,
  getAdditionalUserInfo,
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";

interface AccountStatus {
  type: "deleted" | "banned";
  message: string;
  daysLeft?: number;
  bannedUntil?: string | null;
  banReason?: string | null;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  accountStatus: AccountStatus | null;
  signInWithGoogle: () => Promise<{ isNewUser: boolean }>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, name: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  restoreAccount: () => Promise<void>;
  startFresh: () => Promise<void>;
  clearAccountStatus: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);

  const syncUser = useCallback(async (firebaseUser: User, restoreAction?: string) => {
    const token = await firebaseUser.getIdToken();
    const res = await fetch("/api/auth/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: firebaseUser.displayName ?? firebaseUser.email?.split("@")[0] ?? "User",
        email: firebaseUser.email,
        avatarUrl: firebaseUser.photoURL,
        restoreAction,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.deleted) {
        setAccountStatus({ type: "deleted", message: data.message, daysLeft: data.daysLeft });
        return false;
      }
      if (data.banned) {
        setAccountStatus({ type: "banned", message: data.message, bannedUntil: data.bannedUntil, banReason: data.banReason });
        return false;
      }
      setAccountStatus(null);
      return true;
    }
    return true;
  }, []);

  // Handle redirect result (for Brave / popup-blocked browsers)
  useEffect(() => {
    getRedirectResult(auth).catch(() => { /* no redirect pending */ });
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      if (firebaseUser) {
        await syncUser(firebaseUser);
      } else {
        setAccountStatus(null);
      }
    });
    return unsub;
  }, [syncUser]);

  async function signInWithGoogle() {
    try {
      // Try popup first (works on most browsers)
      const result = await signInWithPopup(auth, googleProvider);
      const info = getAdditionalUserInfo(result);
      return { isNewUser: info?.isNewUser ?? false };
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      // If popup blocked (Brave, some mobile browsers), fall back to redirect
      if (code === "auth/popup-blocked" || code === "auth/popup-closed-by-browser" || code === "auth/cancelled-popup-request" || code === "auth/internal-error") {
        await signInWithRedirect(auth, googleProvider);
        return { isNewUser: false }; // redirect won't return here
      }
      throw err;
    }
  }

  async function signInWithEmail(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function signUpWithEmail(email: string, password: string, name: string) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    const token = await cred.user.getIdToken();
    await fetch("/api/auth/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, email, avatarUrl: null }),
    });
  }

  async function resetPassword(email: string) {
    await sendPasswordResetEmail(auth, email);
  }

  async function signOut() {
    setAccountStatus(null);
    await firebaseSignOut(auth);
  }

  async function restoreAccount() {
    if (!user) return;
    await syncUser(user, "restore");
  }

  async function startFresh() {
    if (!user) return;
    await syncUser(user, "fresh");
  }

  function clearAccountStatus() {
    setAccountStatus(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, accountStatus, signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword, signOut, restoreAccount, startFresh, clearAccountStatus }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
