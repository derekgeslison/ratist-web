import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const VALID_CATEGORIES = ["bug", "inaccurate_info", "feature_request", "account_issue", "content_issue", "other"];

async function getUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  return prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true, email: true } });
}

// POST: submit feedback
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { category, message, email } = body;

  if (!category || !VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }
  if (!message?.trim() || message.length > 5000) {
    return NextResponse.json({ error: "Message is required (max 5,000 characters)" }, { status: 400 });
  }

  const user = await getUser(req);

  // Non-logged-in users must provide email
  if (!user && !email?.trim()) {
    return NextResponse.json({ error: "Email is required for non-logged-in users" }, { status: 400 });
  }

  const feedback = await prisma.feedback.create({
    data: {
      userId: user?.id ?? null,
      email: user?.email ?? email?.trim() ?? null,
      category,
      message: message.trim(),
    },
  });

  return NextResponse.json({ feedback: { id: feedback.id } });
}
