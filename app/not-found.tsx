import Link from "next/link";

export default function NotFound() {
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
        404 — Page not found
      </h1>
      <p
        style={{
          color: "var(--muted)",
          fontSize: "1rem",
          marginBottom: "2rem",
          lineHeight: 1.6,
        }}
      >
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        style={{
          display: "inline-block",
          backgroundColor: "var(--ratist-red)",
          color: "#fff",
          padding: "0.625rem 1.5rem",
          borderRadius: "8px",
          fontWeight: 600,
          fontSize: "0.9375rem",
          textDecoration: "none",
        }}
      >
        Go Home
      </Link>
    </main>
  );
}
