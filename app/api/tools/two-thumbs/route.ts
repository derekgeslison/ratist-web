import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

async function getUser(req: NextRequest) {
  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    return prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  } catch {
    return null;
  }
}

// GET /api/tools/punch-and-judy?movieId=123
export async function GET(req: NextRequest) {
  const movieId = req.nextUrl.searchParams.get("movieId");
  if (!movieId) return NextResponse.json({ error: "Missing movieId" }, { status: 400 });

  const user = await getUser(req);

  const debate = await prisma.punchAndJudyDebate.findUnique({
    where: { movieId: Number(movieId) },
    include: {
      arguments: {
        include: {
          author: { select: { name: true, avatarUrl: true } },
          _count: { select: { helpfuls: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      votes: true,
    },
  });

  if (!debate) return NextResponse.json({ debate: null });

  const forVotes = debate.votes.filter((v) => v.verdict === "for").length;
  const againstVotes = debate.votes.filter((v) => v.verdict === "against").length;
  const userVote = user ? debate.votes.find((v) => v.userId === user.id)?.verdict ?? null : null;

  // Get user's helpfuls
  const userHelpfulIds = user
    ? (
        await prisma.punchAndJudyHelpful.findMany({
          where: {
            userId: user.id,
            argumentId: { in: debate.arguments.map((a) => a.id) },
          },
          select: { argumentId: true },
        })
      ).map((h) => h.argumentId)
    : [];

  return NextResponse.json({
    debate: {
      id: debate.id,
      movieId: debate.movieId,
      movieTitle: debate.movieTitle,
      posterPath: debate.posterPath,
      forArguments: debate.arguments
        .filter((a) => a.side === "for")
        .map((a) => ({
          id: a.id,
          content: a.content,
          authorName: a.author.name,
          authorAvatar: a.author.avatarUrl,
          helpfulCount: a._count.helpfuls,
          isHelpful: userHelpfulIds.includes(a.id),
          createdAt: a.createdAt,
        })),
      againstArguments: debate.arguments
        .filter((a) => a.side === "against")
        .map((a) => ({
          id: a.id,
          content: a.content,
          authorName: a.author.name,
          authorAvatar: a.author.avatarUrl,
          helpfulCount: a._count.helpfuls,
          isHelpful: userHelpfulIds.includes(a.id),
          createdAt: a.createdAt,
        })),
      forVotes,
      againstVotes,
      userVote,
    },
  });
}

// POST /api/tools/punch-and-judy
// actions: create_debate | add_argument | vote | helpful
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action } = body;

  if (action === "create_debate") {
    const { movieId, movieTitle, posterPath } = body;
    if (!movieId || !movieTitle) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const debate = await prisma.punchAndJudyDebate.upsert({
      where: { movieId: Number(movieId) },
      create: { movieId: Number(movieId), movieTitle, posterPath: posterPath ?? null },
      update: {},
    });
    return NextResponse.json({ debate });
  }

  if (action === "add_argument") {
    const { debateId, side, content } = body;
    if (!debateId || !side || !content?.trim()) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (!["for", "against"].includes(side)) {
      return NextResponse.json({ error: "Invalid side" }, { status: 400 });
    }
    if (content.trim().length > 1000) {
      return NextResponse.json({ error: "Argument too long (max 1000 characters)" }, { status: 400 });
    }

    const argument = await prisma.punchAndJudyArgument.create({
      data: { debateId, authorId: user.id, side, content: content.trim() },
    });
    return NextResponse.json({ argument });
  }

  if (action === "vote") {
    const { debateId, verdict } = body;
    if (!debateId || !["for", "against"].includes(verdict)) {
      return NextResponse.json({ error: "Invalid vote" }, { status: 400 });
    }

    const vote = await prisma.punchAndJudyOverallVote.upsert({
      where: { userId_debateId: { userId: user.id, debateId } },
      create: { userId: user.id, debateId, verdict },
      update: { verdict },
    });
    return NextResponse.json({ vote });
  }

  if (action === "helpful") {
    const { argumentId } = body;
    if (!argumentId) return NextResponse.json({ error: "Missing argumentId" }, { status: 400 });

    const existing = await prisma.punchAndJudyHelpful.findUnique({
      where: { userId_argumentId: { userId: user.id, argumentId } },
    });

    if (existing) {
      await prisma.punchAndJudyHelpful.delete({
        where: { userId_argumentId: { userId: user.id, argumentId } },
      });
      return NextResponse.json({ toggled: false });
    } else {
      await prisma.punchAndJudyHelpful.create({ data: { userId: user.id, argumentId } });
      return NextResponse.json({ toggled: true });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
