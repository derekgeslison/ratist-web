"use client";

import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="max-w-md mx-auto px-4 py-24 text-center">
      <h1
        style={{
          fontSize: "2rem",
          fontWeight: 700,
          color: "var(--foreground)",
          marginBottom: "1rem",
        }}
      >
        Something went wrong
      </h1>
      {error.message && (
        <p
          style={{
            color: "var(--muted)",
            fontSize: "0.875rem",
            marginBottom: "2rem",
            lineHeight: 1.6,
          }}
        >
          {error.message}
        </p>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={reset}
          style={{
            backgroundColor: "var(--ratist-red)",
            color: "#fff",
            padding: "0.625rem 1.5rem",
            borderRadius: "8px",
            fontWeight: 600,
            fontSize: "0.9375rem",
            border: "none",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
        <Link
          href="/"
          style={{
            color: "var(--muted)",
            fontSize: "0.9375rem",
            textDecoration: "none",
          }}
        >
          Go Home
        </Link>
      </div>
    </main>
  );
}
