"use client";

import Link from "next/link";
import SignInLink from "@/components/SignInLink";
import { useAuth } from "@/context/AuthContext";

export default function BrandCTAButtons() {
  const { user, loading } = useAuth();

  return (
    <div className="flex items-center gap-3 mt-1">
      <Link
        href="/movies"
        className="px-5 py-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold rounded-full transition-colors"
      >
        Browse Movies
      </Link>
      {!loading && (
        user ? (
          <Link
            href="/tools"
            className="px-5 py-2 bg-[var(--surface-2)] hover:bg-[var(--border)] text-white text-sm font-medium rounded-full border border-[var(--border)] transition-colors"
          >
            Explore Tools
          </Link>
        ) : (
          <SignInLink
            className="px-5 py-2 bg-[var(--surface-2)] hover:bg-[var(--border)] text-white text-sm font-medium rounded-full border border-[var(--border)] transition-colors"
          >
            Join Free
          </SignInLink>
        )
      )}
    </div>
  );
}
