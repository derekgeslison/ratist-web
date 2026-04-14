import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { sendPolicyUpdate } from "@/lib/email";

export const dynamic = "force-dynamic";

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
 * Body: { policyType: "privacy" | "terms" | "both", summary: string }
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { policyType, summary } = await req.json();
  if (!policyType || !summary) {
    return NextResponse.json({ error: "policyType and summary are required" }, { status: 400 });
  }

  const policyName = policyType === "both" ? "Privacy Policy & Terms of Service"
    : policyType === "privacy" ? "Privacy Policy" : "Terms of Service";
  const linkUrl = policyType === "both" ? "/privacy"
    : policyType === "privacy" ? "/privacy" : "/terms";

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
    where: { email: { not: null }, deletedAt: null },
    select: { id: true, name: true, email: true },
  });

  let sent = 0;
  let failed = 0;

  // Process in batches to avoid overwhelming Resend
  const BATCH_SIZE = 10;
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((u) =>
        u.email
          ? sendPolicyUpdate(u.email, u.name, u.id, policyType, summary)
          : Promise.resolve()
      )
    );
    for (const r of results) {
      if (r.status === "fulfilled") sent++;
      else failed++;
    }
    // Small delay between batches to respect rate limits
    if (i + BATCH_SIZE < users.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
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
