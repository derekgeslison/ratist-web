import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
import Image from "next/image";
import Link from "next/link";
import { Users } from "lucide-react";

export default async function CommunityPage() {
  const users = await prisma.user.findMany({
    where: { isPrivate: false },
    include: {
      profile: true,
      _count: { select: { ratings: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 48,
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-8">
        <Users className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">Community</h1>
      </div>

      {users.length === 0 ? (
        <div className="text-center py-20 text-[var(--foreground-muted)]">
          <p>No community members yet. Be the first to sign up!</p>
          <Link href="/auth/signin" className="mt-4 inline-block text-[var(--ratist-red)] hover:underline">Join now →</Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {users.map((user) => (
            <Link
              key={user.id}
              href={`/profile/${user.id}`}
              className="flex flex-col items-center gap-2 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--ratist-red)] transition-colors text-center group"
            >
              <div className="relative w-16 h-16 rounded-full overflow-hidden bg-[var(--surface-2)] border border-[var(--border)]">
                {user.avatarUrl ? (
                  <Image src={user.avatarUrl} alt={user.name} fill sizes="64px" className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xl font-bold text-white bg-[var(--ratist-red)]">
                    {user.name[0].toUpperCase()}
                  </div>
                )}
              </div>
              <p className="text-sm font-medium text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">{user.name}</p>
              <p className="text-xs text-[var(--foreground-muted)]">{user._count.ratings} rated</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
