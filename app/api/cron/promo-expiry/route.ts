import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPromoExpiringSoon } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/promo-expiry
 *
 * Runs daily via Vercel Cron. Finds users with expiring promo subscriptions
 * and sends reminder emails at 30, 14, 7, 3, and 1 day(s) before expiry.
 *
 * Uses a `promoRemindersSent` JSON field on the user to track which
 * reminders have already been sent, preventing duplicates.
 */
const REMINDER_DAYS = [30, 14, 7, 3, 1];

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  // Find users with an expiring admin-granted subscription in the next 31 days
  const maxDate = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000);

  const users = await prisma.user.findMany({
    where: {
      subscriptionStatus: "admin_granted",
      subscriptionTier: "backstage_pass",
      subscriptionExpiry: { not: null, gt: now, lte: maxDate },
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

    // Find the closest reminder threshold
    const threshold = REMINDER_DAYS.find((d) => daysLeft <= d);
    if (!threshold) continue;

    // Check if this reminder was already sent
    const alreadySent = (user.promoRemindersSent as number[] | null) ?? [];
    if (alreadySent.includes(threshold)) continue;

    try {
      await sendPromoExpiringSoon(user.email, user.name, daysLeft);

      // Record that we sent this reminder
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
