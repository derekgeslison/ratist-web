"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  onAuthStateChanged,
  onIdTokenChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  GoogleAuthProvider,
  OAuthProvider,
  type User,
  getAdditionalUserInfo,
} from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { auth, googleProvider, appleProvider } from "@/lib/firebase";

interface AccountStatus {
  type: "deleted" | "banned";
  message: string;
  daysLeft?: number;
  bannedUntil?: string | null;
  banReason?: string | null;
}

interface SubscriptionState {
  hasPass: boolean;
  status: string | null;
  expiry: string | null;
  loading: boolean;
}

interface DbUserSummary {
  /** DB-side display name. Distinct from `firebaseUser.displayName`, which
   *  comes from the OAuth provider — we never overwrite the DB value on
   *  re-sign-in, so this is the authoritative one. */
  name: string;
  /** DB-side avatar. Same story — preserved across sign-in providers. */
  avatarUrl: string | null;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  needsOnboarding: boolean;
  /** Authoritative DB user identity (name + avatar). Read this — NOT
   *  `firebaseUser.displayName` / `firebaseUser.photoURL` — when rendering
   *  the viewer's own profile chrome anywhere on the site. Reason: a user
   *  who signed up via email/password then later signed in via Google
   *  has a `firebaseUser.photoURL` populated by Google, but their DB
   *  avatarUrl is whatever they set (or null). The DB value is the one
   *  we want everywhere so account-linking doesn't visually override it. */
  dbUser: DbUserSummary | null;
  /** ISO string when the home tour banner was dismissed server-side
   *  (or the user took the tour). Null = banner still active. Mirrored
   *  here so client components can decide whether to render the banner
   *  without an extra fetch. */
  tourDismissedAt: string | null;
  accountStatus: AccountStatus | null;
  /** Backstage Pass subscription state — fetched once per session and
   *  shared across every `useSubscription()` call. Avoids the ~5–10
   *  parallel requests to /api/subscription/status that used to happen
   *  on every page mount (Navbar + AdUnit + page-level checks). */
  subscription: SubscriptionState;
  signInWithGoogle: () => Promise<{ isNewUser: boolean }>;
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
  const [dbUser, setDbUser] = useState<DbUserSummary | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionState>({
    hasPass: false,
    status: null,
    expiry: null,
    loading: true,
  });

  // One subscription fetch per session, triggered when the Firebase
  // user is established / cleared. All `useSubscription()` consumers
  // read from this context, so the API call doesn't fan out to every
  // page mount with a Pass-aware component.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      setSubscription({ hasPass: false, status: null, expiry: null, loading: false });
      return;
    }
    let cancelled = false;
    setSubscription((prev) => ({ ...prev, loading: true }));
    user.getIdToken()
      .then((token) => fetch("/api/subscription/status", { headers: { Authorization: `Bearer ${token}` } }))
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setSubscription({
          hasPass: d.hasBackstagePass ?? false,
          status: d.status ?? null,
          expiry: d.expiry ?? null,
          loading: false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setSubscription((prev) => ({ ...prev, loading: false }));
      });
    return () => { cancelled = true; };
  }, [user, loading]);

  const syncUser = useCallback(async (firebaseUser: User, restoreAction?: string) => {
    const token = await firebaseUser.getIdToken();
    // Compute a safe default display name. If the provider gave us a
    // displayName (Google / Apple-with-name-shared), use it. Otherwise
    // we DO NOT fall back to the email's local part — that leaks the
    // address for Apple Hide-My-Email users (anyone seeing the username
    // can append @privaterelay.appleid.com to derive the relay email).
    // Onboarding's step 1 prompts every user to set a real name, so
    // "User" is a transient placeholder at worst.
    const safeName = firebaseUser.displayName ?? "User";
    const res = await fetch("/api/auth/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: safeName,
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
      // Capture authoritative DB-side name + avatar so consumers like
      // the Navbar can render the user's actual chosen identity rather
      // than whatever the current sign-in provider supplied.
      if (data.user) {
        setDbUser({
          name: data.user.name ?? "User",
          avatarUrl: data.user.avatarUrl ?? null,
        });
      }
      return true;
    }
    return true;
  }, []);

  // Handle redirect result (for Brave / popup-blocked browsers)
  useEffect(() => {
    getRedirectResult(auth).catch(() => { /* no redirect pending */ });
  }, []);

  // Mirror the Firebase ID token into a `__session` cookie so server
  // components (e.g. /releases, year-in-review admin bypass) can
  // identify the viewer. Firebase auto-refreshes the token roughly
  // hourly via onIdTokenChanged; we re-write the cookie each refresh
  // so it never lags behind the live token. Non-HTTPOnly because we
  // also need it readable from the client; same trust boundary the
  // existing fetch-with-Bearer pattern already operates under.
  useEffect(() => {
    const unsub = onIdTokenChanged(auth, async (firebaseUser) => {
      if (typeof document === "undefined") return;
      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken();
          const secure = location.protocol === "https:" ? " secure;" : "";
          document.cookie = `__session=${token}; path=/; max-age=3500; samesite=lax;${secure}`;
        } catch { /* token fetch failed — leave cookie stale, next refresh retries */ }
      } else {
        document.cookie = "__session=; path=/; max-age=0; samesite=lax;";
      }
    });
    return unsub;
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
        setDbUser(null);
      }
    });
    return unsub;
  }, [syncUser]);

  async function signInWithGoogle() {
    // Native (Capacitor) path: use the @capacitor-firebase/authentication
    // plugin so we get the OS account picker instead of an embedded
    // WebView OAuth (which Google blocks for security). The plugin
    // returns an OAuth credential we exchange with Firebase JS so the
    // rest of the auth pipeline (onAuthStateChanged etc.) is unchanged.
    if (Capacitor.isNativePlatform()) {
      const result = await FirebaseAuthentication.signInWithGoogle();
      const idToken = result.credential?.idToken;
      const accessToken = result.credential?.accessToken;
      if (!idToken && !accessToken) throw new Error("Google sign-in returned no credential");
      const credential = GoogleAuthProvider.credential(idToken ?? null, accessToken ?? null);
      const userCred = await signInWithCredential(auth, credential);
      const info = getAdditionalUserInfo(userCred);
      return { isNewUser: info?.isNewUser ?? false };
    }
    try {
      // Web: try popup first (works on most browsers)
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

  async function signInWithApple() {
    if (Capacitor.isNativePlatform()) {
      // Native Sign in with Apple — uses ASAuthorizationAppleIDProvider
      // on iOS / Sign in with Apple JS on Android via the plugin. The
      // raw nonce is required so Firebase can verify the Apple token.
      const result = await FirebaseAuthentication.signInWithApple({ scopes: ["email", "name"] });
      const idToken = result.credential?.idToken;
      const nonce = result.credential?.nonce;
      if (!idToken) throw new Error("Apple sign-in returned no idToken");
      const provider = new OAuthProvider("apple.com");
      const credential = provider.credential({ idToken, rawNonce: nonce });
      const userCred = await signInWithCredential(auth, credential);
      // First-sign-in name capture (same rationale as the web path below)
      const info = getAdditionalUserInfo(userCred);
      if (info?.isNewUser && userCred.user && !userCred.user.displayName) {
        const profile = result.additionalUserInfo?.profile as
          | { name?: { firstName?: string; lastName?: string } }
          | undefined;
        const composed = [
          result.user?.displayName,
          profile?.name?.firstName,
          profile?.name?.lastName,
        ]
          .filter((s) => typeof s === "string" && s.length > 0)
          .join(" ")
          .trim();
        if (composed) {
          try { await updateProfile(userCred.user, { displayName: composed }); } catch { /* non-fatal */ }
        }
      }
      return { isNewUser: info?.isNewUser ?? false };
    }
    try {
      const result = await signInWithPopup(auth, appleProvider);
      const info = getAdditionalUserInfo(result);
      // Apple sends the user's name ONLY on the very first sign-in (in the
      // OAuth payload's `profile.name`). After that, `firebaseUser.displayName`
      // would stay null forever — and our /api/auth/sync would fall back to
      // splitting the email, which produces gibberish for "Hide My Email"
      // accounts (e.g. `random123@privaterelay.appleid.com`).
      // So we capture the name here on first sign-in and persist it via
      // updateProfile so it sticks for every subsequent session.
      if (info?.isNewUser && result.user && !result.user.displayName) {
        const profile = info.profile as { name?: { firstName?: string; lastName?: string }; firstName?: string; lastName?: string } | null;
        const first = profile?.name?.firstName ?? profile?.firstName;
        const last = profile?.name?.lastName ?? profile?.lastName;
        const composed = [first, last].filter(Boolean).join(" ").trim();
        if (composed) {
          try { await updateProfile(result.user, { displayName: composed }); } catch { /* non-fatal */ }
        }
      }
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
    <AuthContext.Provider value={{ user, loading, dbUser, needsOnboarding, tourDismissedAt, accountStatus, subscription, signInWithGoogle, signInWithApple, signInWithEmail, signUpWithEmail, resetPassword, signOut, restoreAccount, startFresh, clearAccountStatus, completeOnboarding, markTourDismissed: () => setTourDismissedAt(new Date().toISOString()) }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
