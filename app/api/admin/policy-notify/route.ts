import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { sendPolicyUpdate } from "@/lib/email";

export const dynamic = "force-dynamic";
// Sequential 600ms sends, capped to Vercel Pro's max so even a few
// thousand users finish in one request.
export const maxDuration = 300;

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user?.isAdmin) return null;
  return user;
}

/**
 * POST /api/admin/policy-notify
 *
 * Sends policy update notification to all users:
 * 1. Creates an announcement banner (site spotlight)
 * 2. Sends email to ALL users (ignores emailOptOut — legal requirement)
 *
 * Body: {
 *   policyType: "privacy" | "terms" | "both",
 *   summary: string,
 *   testOnly?: boolean  // when true: send only to the requesting admin,
 *                       // skip the banner + admin log so the production
 *                       // notification record stays clean.
 * }
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { policyType, summary, testOnly } = await req.json();
  if (!policyType || !summary) {
    return NextResponse.json({ error: "policyType and summary are required" }, { status: 400 });
  }

  const policyName = policyType === "both" ? "Privacy Policy & Terms of Service"
    : policyType === "privacy" ? "Privacy Policy" : "Terms of Service";
  const linkUrl = policyType === "both" ? "/privacy"
    : policyType === "privacy" ? "/privacy" : "/terms";

  // Test mode: send a single email to the admin and return early.
  // No banner, no admin log — preview only.
  if (testOnly === true) {
    if (!admin.email) {
      return NextResponse.json({ error: "Your account has no email on file." }, { status: 400 });
    }
    try {
      const ok = await sendPolicyUpdate(admin.email, admin.name, admin.id, policyType, summary);
      return NextResponse.json({ test: true, sent: ok ? 1 : 0, failed: ok ? 0 : 1, to: admin.email });
    } catch {
      return NextResponse.json({ test: true, sent: 0, failed: 1, to: admin.email });
    }
  }

  // 1. Create announcement banner
  await prisma.siteSpotlight.create({
    data: {
      title: `We've updated our ${policyName}`,
      description: summary.slice(0, 200),
      linkUrl,
      linkLabel: `View ${policyName}`,
      type: "announcement",
      isActive: true,
      sortOrder: -1, // show above other spotlights
    },
  });

  // 2. Send email to all users (legal notification — ignores emailOptOut)
  const users = await prisma.user.findMany({
    where: { email: { not: "" }, deletedAt: null },
    select: { id: true, name: true, email: true },
  });

  let sent = 0;
  let failed = 0;

  // Resend free tier rate-limits at 2 requests/sec. Sequential sends
  // with a 600ms gap stay safely under that. Counting relies on the
  // boolean sendPolicyUpdate now returns — sendEmail catches Resend
  // errors and returns false, so anything that failed in flight is
  // tallied as failed (previously counted as sent because the outer
  // Promise resolved either way and Promise.allSettled saw "fulfilled").
  for (const u of users) {
    if (!u.email) {
      failed++;
      continue;
    }
    try {
      const ok = await sendPolicyUpdate(u.email, u.name, u.id, policyType, summary);
      if (ok) sent++;
      else failed++;
    } catch {
      failed++;
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
  }

  // Log the action
  await prisma.adminLog.create({
    data: {
      adminId: admin.id,
      action: "policy_update_notification",
      details: `Sent ${policyName} update to ${sent} users (${failed} failed). Summary: ${summary.slice(0, 200)}`,
    },
  }).catch(() => {});

  return NextResponse.json({ sent, failed, total: users.length });
}
