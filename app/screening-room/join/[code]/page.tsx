"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { MonitorPlay } from "lucide-react";
import Link from "next/link";

export default function JoinByLinkPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<"loading" | "joining" | "error" | "signin">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setStatus("signin"); return; }

    setStatus("joining");
    user.getIdToken().then(async (token) => {
      const res = await fetch("/api/screening/join", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.toUpperCase() }),
      });
      if (res.ok) {
        const data = await res.json();
        router.replace(`/screening-room/${data.sessionId}`);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to join");
        setStatus("error");
      }
    });
  }, [authLoading, user, code, router]);

  return (
    <div className="max-w-md mx-auto px-4 py-20 text-center">
      <MonitorPlay className="w-10 h-10 text-[var(--ratist-red)] mx-auto mb-4" />
      {status === "loading" || status === "joining" ? (
        <>
          <h1 className="text-xl font-bold text-white mb-2">Joining Screening Room...</h1>
          <p className="text-sm text-[var(--foreground-muted)]">Code: {code?.toUpperCase()}</p>
        </>
      ) : status === "signin" ? (
        <>
          <h1 className="text-xl font-bold text-white mb-2">Join Screening Room</h1>
          <p className="text-sm text-[var(--foreground-muted)] mb-4">Sign in to join with code {code?.toUpperCase()}</p>
          <Link href={`/auth/signin?redirect=${encodeURIComponent(`/screening-room/join/${code}`)}`} className="inline-block bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors">
            Sign In
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-xl font-bold text-white mb-2">Couldn&apos;t Join</h1>
          <p className="text-sm text-red-400 mb-4">{error}</p>
          <Link href="/screening-room" className="text-sm text-[var(--ratist-red)] hover:underline">
            Back to Screening Rooms
          </Link>
        </>
      )}
    </div>
  );
}
