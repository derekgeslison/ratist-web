"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/** Redirect to the main session page which handles all states including recap */
export default function RecapRedirectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/screening-room/${id}`);
  }, [id, router]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-20 text-center text-[var(--foreground-muted)]">
      Redirecting...
    </div>
  );
}
