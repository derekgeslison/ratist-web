import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const VALID_REASONS = ["spam", "harassment", "inappropriate", "spoilers", "other"];
const VALID_TYPES = ["review", "comment", "forumPost", "hotTake", "recast", "looksLike", "companion_suggestion"];

// POST /api/reports — submit a report
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { targetType, targetId, reason, details } = await req.json();

    if (!VALID_TYPES.includes(targetType)) return NextResponse.json({ error: "Invalid target type" }, { status: 400 });
    if (!VALID_REASONS.includes(reason)) return NextResponse.json({ error: "Invalid reason" }, { status: 400 });
    if (!targetId) return NextResponse.json({ error: "targetId required" }, { status: 400 });

    // Prevent duplicate reports from same user on same target
    const existing = await prisma.report.findFirst({
      where: { reporterId: user.id, targetType, targetId, status: "pending" },
    });
    if (existing) return NextResponse.json({ error: "You've already reported this" }, { status: 409 });

    const report = await prisma.report.create({
      data: {
        targetType,
        targetId,
        reporterId: user.id,
        reason,
        details: details?.trim() || null,
      },
    });

    return NextResponse.json({ report: { id: report.id } });
  } catch (err) {
    console.error("Report error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
