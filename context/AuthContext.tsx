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
  sendEmailVerification,
  updateProfile,
  type User,
  getAdditionalUserInfo,
} from "firebase/auth";
import { auth, googleProvider, facebookProvider, appleProvider } from "@/lib/firebase";

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
  needsOnboarding: boolean;
  /** ISO string when the home tour banner was dismissed server-side
   *  (or the user took the tour). Null = banner still active. Mirrored
   *  here so client components can decide whether to render the banner
   *  without an extra fetch. */
  tourDismissedAt: string | null;
  accountStatus: AccountStatus | null;
  signInWithGoogle: () => Promise<{ isNewUser: boolean }>;
  signInWithFacebook: () => Promise<{ isNewUser: boolean }>;
  signInWithApple: () => Promise<{ isNewUser: boolean }>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, name: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  restoreAccount: () => Promise<void>;
  startFresh: () => Promise<void>;
  clearAccountStatus: () => void;
  completeOnboarding: () => Promise<void>;
  /** Optimistically marks the tour dismissed locally so the banner
   *  hides immediately. Caller is responsible for the server write. */
  markTourDismissed: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [tourDismissedAt, setTourDismissedAt] = useState<string | null>(null);
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
      setNeedsOnboarding(data.needsOnboarding === true);
      setTourDismissedAt(data.user?.tourDismissedAt ?? null);
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
      if (firebaseUser) {
        // Block unverified email/password users from accessing the app
        // Don't sign out here — that causes a race condition with signInWithEmail
        const isEmailProvider = firebaseUser.providerData.some((p) => p.providerId === "password");
        if (isEmailProvider && !firebaseUser.emailVerified) {
          setUser(null);
          setLoading(false);
          return;
        }
        setUser(firebaseUser);
        setLoading(false);
        await syncUser(firebaseUser);
      } else {
        setUser(null);
        setLoading(false);
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

  async function signInWithFacebook() {
    try {
      const result = await signInWithPopup(auth, facebookProvider);
      const info = getAdditionalUserInfo(result);
      return { isNewUser: info?.isNewUser ?? false };
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "auth/popup-blocked" || code === "auth/popup-closed-by-browser" || code === "auth/cancelled-popup-request" || code === "auth/internal-error") {
        await signInWithRedirect(auth, facebookProvider);
        return { isNewUser: false };
      }
      throw err;
    }
  }

  async function signInWithApple() {
    try {
      const result = await signInWithPopup(auth, appleProvider);
      const info = getAdditionalUserInfo(result);
      return { isNewUser: info?.isNewUser ?? false };
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "auth/popup-blocked" || code === "auth/popup-closed-by-browser" || code === "auth/cancelled-popup-request" || code === "auth/internal-error") {
        await signInWithRedirect(auth, appleProvider);
        return { isNewUser: false };
      }
      throw err;
    }
  }

  async function signInWithEmail(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    if (!cred.user.emailVerified) {
      // Send another verification email in case they need it
      await sendEmailVerification(cred.user).catch(() => {});
      await firebaseSignOut(auth);
      throw new Error("EMAIL_NOT_VERIFIED");
    }
  }

  async function signUpWithEmail(email: string, password: string, name: string) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    // Send verification email (non-blocking — don't fail signup if this errors)
    await sendEmailVerification(cred.user).catch((err) => {
      console.warn("Failed to send verification email:", err?.code ?? err);
    });
    // Sync user to DB so they exist, but sign them out until verified
    const token = await cred.user.getIdToken();
    await fetch("/api/auth/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, email, avatarUrl: null }),
    });
    await firebaseSignOut(auth);
  }

  async function resetPassword(email: string) {
    await sendPasswordResetEmail(auth, email);
  }

  async function signOut() {
    setAccountStatus(null);
    await firebaseSignOut(auth);
  }

  async function completeOnboarding() {
    if (!user) return;
    const token = await user.getIdToken();
    await fetch("/api/auth/onboarded", { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    setNeedsOnboarding(false);
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
    <AuthContext.Provider value={{ user, loading, needsOnboarding, tourDismissedAt, accountStatus, signInWithGoogle, signInWithFacebook, signInWithApple, signInWithEmail, signUpWithEmail, resetPassword, signOut, restoreAccount, startFresh, clearAccountStatus, completeOnboarding, markTourDismissed: () => setTourDismissedAt(new Date().toISOString()) }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
