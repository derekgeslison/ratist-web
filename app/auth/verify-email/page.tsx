"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Mail, RefreshCw, Check } from "lucide-react";
import { signInWithEmailAndPassword, sendEmailVerification, signOut as firebaseSignOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function VerifyEmailPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function resendVerification(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setSending(true);
    setError("");
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      if (cred.user.emailVerified) {
        // Already verified — redirect to home
        window.location.href = "/";
        return;
      }
      await sendEmailVerification(cred.user);
      await firebaseSignOut(auth);
      setSent(true);
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setError("Incorrect email or password");
      } else if (code === "auth/too-many-requests") {
        setError("Too many attempts. Please wait a few minutes.");
      } else {
        setError("Failed to resend. Please try again.");
      }
    } finally {
      setSending(false);
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

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-[var(--ratist-red)]/20 flex items-center justify-center mx-auto mb-4">
            <Mail className="w-7 h-7 text-[var(--ratist-red)]" />
          </div>

          <h1 className="text-xl font-bold text-white mb-2">Verify Your Email</h1>
          <p className="text-sm text-[var(--foreground-muted)] mb-6">
            We sent a verification link to your email address. Click the link to verify your account, then sign in.
          </p>

          {sent ? (
            <div className="flex items-center justify-center gap-2 text-sm text-green-400 mb-4">
              <Check className="w-4 h-4" /> Verification email sent!
            </div>
          ) : (
            <form onSubmit={resendVerification} className="space-y-3 mb-4">
              <p className="text-xs text-[var(--foreground-muted)]">Didn&apos;t receive the email? Enter your credentials to resend:</p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                required
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
              />
              {error && <p className="text-sm text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={sending}
                className="w-full flex items-center justify-center gap-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${sending ? "animate-spin" : ""}`} />
                {sending ? "Sending..." : "Resend Verification Email"}
              </button>
            </form>
          )}

          <Link href="/auth/signin" className="text-sm text-[var(--ratist-red)] hover:underline">
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
