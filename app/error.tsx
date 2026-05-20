"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Hard-reload paths. The default <Link href="/"> + reset() pair can
  // get stuck when the failing render is the homepage itself — both
  // soft paths re-execute the same broken render and the user sees the
  // same screen, making the buttons feel inert. Forcing a full page
  // load via window.location bypasses Next.js's in-memory error state
  // entirely and gives the server a clean shot at rendering.
  function tryAgain() {
    try { reset(); } catch { /* fall through */ }
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }
  function goHome() {
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  }

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
        Something went wrong on our end
      </h1>
      <p
        style={{
          color: "var(--muted)",
          fontSize: "0.9375rem",
          marginBottom: "0.5rem",
          lineHeight: 1.6,
        }}
      >
        We hit a snag loading this page. Refreshing usually clears it. If it keeps happening, head home and try again from there — we&apos;ve been notified and are looking into it.
      </p>
      {error.digest && (
        <p
          style={{
            color: "var(--muted)",
            fontSize: "0.75rem",
            opacity: 0.6,
            marginBottom: "2rem",
            fontFamily: "monospace",
          }}
        >
          Reference: {error.digest}
        </p>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          flexWrap: "wrap",
          marginTop: error.digest ? 0 : "1.5rem",
        }}
      >
        <button
          onClick={tryAgain}
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
        <button
          onClick={goHome}
          style={{
            backgroundColor: "transparent",
            color: "var(--muted)",
            padding: "0.625rem 1.5rem",
            fontSize: "0.9375rem",
            border: "none",
            cursor: "pointer",
          }}
        >
          Go Home
        </button>
      </div>
    </main>
  );
}
