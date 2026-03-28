"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, email);
      setSubmitted(true);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/user-not-found" || code === "auth/invalid-email") {
        setError("No account found with that email address.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        backgroundColor: "var(--background)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          backgroundColor: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "2.5rem 2rem",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1.5rem",
        }}
      >
        {/* Logo */}
        <Link href="/">
          <Image
            src="/logo-full.png"
            alt="Ratist"
            width={140}
            height={40}
            style={{ objectFit: "contain" }}
            priority
          />
        </Link>

        {submitted ? (
          /* Success state */
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <p style={{ color: "var(--foreground)", fontSize: "1rem", lineHeight: 1.6 }}>
              Check your inbox — we&apos;ve sent a reset link.
            </p>
            <Link
              href="/auth/signin"
              style={{
                color: "var(--ratist-red)",
                fontSize: "0.875rem",
                textDecoration: "none",
              }}
            >
              ← Back to sign in
            </Link>
          </div>
        ) : (
          /* Form state */
          <>
            <div style={{ textAlign: "center", width: "100%" }}>
              <h1
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 600,
                  color: "var(--foreground)",
                  margin: 0,
                }}
              >
                Forgot your password?
              </h1>
              <p
                style={{
                  marginTop: "0.5rem",
                  fontSize: "0.875rem",
                  color: "var(--muted)",
                }}
              >
                Enter your email and we&apos;ll send you a reset link.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              style={{ width: "100%", display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                <label
                  htmlFor="email"
                  style={{ fontSize: "0.8125rem", color: "var(--muted)", fontWeight: 500 }}
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={{
                    width: "100%",
                    padding: "0.625rem 0.875rem",
                    backgroundColor: "var(--background)",
                    border: `1px solid ${error ? "var(--ratist-red)" : "var(--border)"}`,
                    borderRadius: "8px",
                    color: "var(--foreground)",
                    fontSize: "0.9375rem",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                {error && (
                  <p style={{ fontSize: "0.8125rem", color: "var(--ratist-red)", margin: 0 }}>
                    {error}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "0.6875rem",
                  backgroundColor: loading ? "var(--border)" : "var(--ratist-red)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "0.9375rem",
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  transition: "opacity 0.15s",
                }}
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>

            <Link
              href="/auth/signin"
              style={{
                color: "var(--ratist-red)",
                fontSize: "0.875rem",
                textDecoration: "none",
              }}
            >
              ← Back to sign in
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
