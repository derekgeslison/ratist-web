import { prisma } from "@/lib/prisma";
import { verifyUnsubToken } from "@/lib/unsubscribe";
import Link from "next/link";

interface Props {
  searchParams: Promise<{ uid?: string; token?: string }>;
}

export default async function UnsubscribePage({ searchParams }: Props) {
  const { uid, token } = await searchParams;

  let success = false;
  let error = "";

  if (uid && token) {
    if (verifyUnsubToken(uid, token)) {
      await prisma.user.update({
        where: { id: uid },
        data: { emailOptOut: true },
      }).catch(() => { error = "Account not found."; });
      if (!error) success = true;
    } else {
      error = "Invalid or expired link.";
    }
  } else {
    error = "Missing parameters.";
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center">
      {success ? (
        <>
          <h1 className="text-2xl font-bold text-white mb-4">Unsubscribed</h1>
          <p className="text-[var(--foreground-muted)] mb-6">
            You&apos;ve been unsubscribed from Ratist marketing and reminder emails. You&apos;ll still receive essential account emails (password resets, security alerts).
          </p>
          <p className="text-sm text-[var(--foreground-muted)]">
            Changed your mind? You can re-enable emails anytime from your{" "}
            <Link href="/profile" className="text-[var(--ratist-red)] hover:underline">profile settings</Link>.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold text-white mb-4">Unsubscribe</h1>
          <p className="text-red-400">{error}</p>
          <p className="text-sm text-[var(--foreground-muted)] mt-4">
            <Link href="/" className="text-[var(--ratist-red)] hover:underline">Return to The Ratist</Link>
          </p>
        </>
      )}
    </div>
  );
}
