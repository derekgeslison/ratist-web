import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";

async function getUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  return prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true, name: true } });
}

// POST: claim the opponent spot on an open debate thread
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const thread = await prisma.forumThread.findUnique({ where: { slug } });
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  if (thread.threadType !== "debate") return NextResponse.json({ error: "Not a debate thread" }, { status: 400 });
  if (thread.opponentId) return NextResponse.json({ error: "Opponent spot already taken" }, { status: 409 });
  if (thread.authorId === user.id) return NextResponse.json({ error: "You can't debate yourself" }, { status: 400 });
  if (thread.bootedUserIds.includes(user.id)) return NextResponse.json({ error: "You were removed from this debate and cannot rejoin" }, { status: 403 });

  const updated = await prisma.forumThread.update({
    where: { id: thread.id },
    data: { opponentId: user.id, opponentJoinedAt: new Date() },
    include: {
      opponent: { select: { id: true, firebaseUid: true, name: true, avatarUrl: true } },
    },
  });

  // Notify the OP that someone accepted their challenge
  notify({
    recipientId: thread.authorId,
    actorId: user.id,
    type: "comment",
    targetType: "forumThread",
    targetId: thread.id,
    message: `${user.name} accepted your debate challenge on "${thread.title}"`,
    link: `/forum/t/${slug}`,
  }).catch(() => {});

  return NextResponse.json({ opponent: updated.opponent });
}
