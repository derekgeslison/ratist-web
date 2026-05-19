"use client";

import { useState, Suspense, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  isRecaptchaConfigured,
  renderRecaptchaWidget,
  getRecaptchaResponse,
  resetRecaptcha,
} from "@/lib/recaptcha-client";

function SignInForm() {
  const { signInWithGoogle, signInWithApple, signInWithEmail, signUpWithEmail } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showVerifyLink, setShowVerifyLink] = useState(false);

  // reCAPTCHA v2 widget (signup mode only). The site key being unset
  // makes this a no-op; signup still works but without the gate.
  const captchaRef = useRef<HTMLDivElement>(null);
  const captchaWidgetIdRef = useRef<number | null>(null);
  const captchaActive = isRecaptchaConfigured();

  useEffect(() => {
    if (mode !== "signup" || !captchaActive || !captchaRef.current) return;
    if (captchaWidgetIdRef.current != null) return;
    let cancelled = false;
    renderRecaptchaWidget(captchaRef.current).then((id) => {
      if (!cancelled) captchaWidgetIdRef.current = id;
    });
    return () => { cancelled = true; };
  }, [mode, captchaActive]);

  async function handleGoogle() {
    setError("");
    setLoading(true);
    try {
      const { isNewUser } = await signInWithGoogle();
      router.push(isNewUser ? "/onboarding" : (redirectTo ?? "/"));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Google sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleApple() {
    setError("");
    setLoading(true);
    try {
      const { isNewUser } = await signInWithApple();
      router.push(isNewUser ? "/onboarding" : (redirectTo ?? "/"));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Apple sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "signup") {
        let captchaToken: string | null = null;
        if (captchaActive) {
          captchaToken = getRecaptchaResponse(captchaWidgetIdRef.current);
          if (!captchaToken) {
            setError("Please complete the “I'm not a robot” check.");
            setLoading(false);
            return;
          }
        }
        await signUpWithEmail(email, password, name, captchaToken);
        router.push("/auth/verify-email");
      } else {
        // signInWithEmail now awaits the DB sync inline and returns
        // needsOnboarding, so we can route fresh accounts straight to
        // /onboarding instead of flashing the home page first and then
        // having OnboardingGuard redirect.
        const { needsOnboarding } = await signInWithEmail(email, password);
        router.push(needsOnboarding ? "/onboarding" : (redirectTo ?? "/"));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Authentication failed";
      const code = (e as { code?: string })?.code;
      if (msg === "EMAIL_NOT_VERIFIED") {
        router.push("/auth/verify-email");
        return;
      }
      if (code === "auth/invalid-credential") {
        setError("Invalid email or password. If you recently signed up, make sure you've verified your email first.");
        setShowVerifyLink(true);
      } else {
        setError(msg);
      }
      // Reset captcha so the user can retry without a stale token.
      if (mode === "signup" && captchaActive) resetRecaptcha(captchaWidgetIdRef.current);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <Link href="/">
            <Image src="/logo-full.png" alt="The Ratist" width={140} height={70} className="h-16 w-auto" />
          </Link>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8">
          <h1 className="text-xl font-bold text-white text-center mb-6">
            {mode === "signin" ? "Sign in to The Ratist" : "Create your account"}
          </h1>

          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-800 font-medium text-sm px-4 py-2.5 rounded-lg transition-colors mb-4 disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          {/* Apple */}
          <button
            onClick={handleApple}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-black hover:bg-gray-900 text-white font-medium text-sm px-4 py-2.5 rounded-lg transition-colors border border-gray-700 mb-4 disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
            </svg>
            Continue with Apple
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-[var(--border)]" />
            <span className="text-xs text-[var(--foreground-muted)]">or</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          {/* Email form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "signup" && (
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                required
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
              />
            )}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              required
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
            />
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                minLength={6}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
              />
              {mode === "signin" && (
                <div className="text-right mt-1">
                  <Link href="/auth/reset-password" className="text-xs text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors">
                    Forgot password?
                  </Link>
                </div>
              )}
            </div>
            {mode === "signup" && (
              <label className="flex items-start gap-2 text-xs text-[var(--foreground-muted)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={ageConfirmed}
                  onChange={(e) => setAgeConfirmed(e.target.checked)}
                  required
                  className="mt-0.5 accent-[var(--ratist-red)]"
                />
                <span>I confirm I am 13 years of age or older.</span>
              </label>
            )}
            {mode === "signup" && captchaActive && (
              <div ref={captchaRef} className="flex justify-center" />
            )}
            {error && (
              <div>
                <p className="text-sm text-red-400">{error}</p>
                {showVerifyLink && (
                  <Link href="/auth/verify-email" className="text-xs text-[var(--ratist-red)] hover:underline mt-1 inline-block">
                    Need to verify your email? →
                  </Link>
                )}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? "..." : mode === "signin" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <p className="text-center text-sm text-[var(--foreground-muted)] mt-4">
            {mode === "signin" ? (
              <>Don&apos;t have an account?{" "}
                <button onClick={() => setMode("signup")} className="text-[var(--ratist-red)] hover:underline">
                  Sign up
                </button>
              </>
            ) : (
              <>Already have an account?{" "}
                <button onClick={() => setMode("signin")} className="text-[var(--ratist-red)] hover:underline">
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="min-h-[80vh] flex items-center justify-center"><p className="text-[var(--foreground-muted)]">Loading...</p></div>}>
      <SignInForm />
    </Suspense>
  );
}
