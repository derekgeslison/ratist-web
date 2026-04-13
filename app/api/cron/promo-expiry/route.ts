import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPromoExpiringSoon } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/promo-expiry
 *
 * Runs daily via Vercel Cron. Finds users with expiring promo subscriptions
 * and sends reminder emails at 30, 7, and 1 day(s) before expiry.
 *
 * Skips users who have opted out of emails (emailOptOut = true).
 * Uses promoRemindersSent JSON field to prevent duplicate sends.
 */
const REMINDER_DAYS = [30, 7, 1];

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const maxDate = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000);

  const users = await prisma.user.findMany({
    where: {
      subscriptionStatus: "admin_granted",
      subscriptionTier: "backstage_pass",
      subscriptionExpiry: { not: null, gt: now, lte: maxDate },
      emailOptOut: false,
    },
    select: {
      id: true,
      name: true,
      email: true,
      subscriptionExpiry: true,
      promoRemindersSent: true,
    },
  });

  let sent = 0;
  const errors: string[] = [];

  for (const user of users) {
    if (!user.email || !user.subscriptionExpiry) continue;

    const msLeft = user.subscriptionExpiry.getTime() - now.getTime();
    const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));

    // Find the closest reminder threshold that applies
    const threshold = REMINDER_DAYS.find((d) => daysLeft <= d);
    if (!threshold) continue;

    // Check if this reminder was already sent
    const alreadySent = (user.promoRemindersSent as number[] | null) ?? [];
    if (alreadySent.includes(threshold)) continue;

    try {
      await sendPromoExpiringSoon(user.email, user.name, daysLeft, user.id);

      await prisma.user.update({
        where: { id: user.id },
        data: { promoRemindersSent: [...alreadySent, threshold] },
      });

      sent++;
    } catch (err) {
      errors.push(`${user.email}: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  return NextResponse.json({
    checked: users.length,
    sent,
    errors: errors.length > 0 ? errors : undefined,
  });
}
