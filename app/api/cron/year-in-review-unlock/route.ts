import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, shouldSendEmail } from "@/lib/email";
import { notify } from "@/lib/notifications";
import { MIN_TITLES_FOR_YIR } from "@/lib/year-in-review/data";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/year-in-review-unlock
 *
 * Runs on December 1 (00:00 UTC) via Vercel Cron. For each user who has
 * rated at least MIN_TITLES_FOR_YIR titles (movies + shows combined,
 * with a ratistRating set) during the current year, fires:
 *
 *   - an in-app notification linking to their Year in Review
 *   - a "promotional" category email with the same link
 *
 * Idempotent — if a `yir_unlock` notification already exists for the
 * user/year, the user is skipped. Safe to re-run if the scheduled
 * trigger misses or you want to retry a partial batch manually.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
  const targetId = String(year);
  const targetType = "year_in_review";

  // ── Aggregate eligible users (rated count >= MIN_TITLES_FOR_YIR) ──
  // Rating creation timestamp is used as the year-scope proxy. A
  // user who rated 4 movies + 2 shows this year clears the bar; the
  // page itself uses watchedDate scoping but the audience filter is
  // best kept loose so we don't miss reviewers who logged ratings
  // without a watch date.
  const [movieCounts, showCounts] = await Promise.all([
    prisma.movieRating.groupBy({
      by: ["userId"],
      where: { ratistRating: { not: null }, createdAt: { gte: yearStart, lt: yearEnd } },
      _count: { id: true },
    }),
    prisma.tVShowRating.groupBy({
      by: ["userId"],
      where: { ratistRating: { not: null }, ratingScope: "series", createdAt: { gte: yearStart, lt: yearEnd } },
      _count: { id: true },
    }),
  ]);

  const combined = new Map<string, number>();
  for (const r of movieCounts) combined.set(r.userId, (combined.get(r.userId) ?? 0) + r._count.id);
  for (const r of showCounts) combined.set(r.userId, (combined.get(r.userId) ?? 0) + r._count.id);

  const eligibleIds = [...combined.entries()]
    .filter(([, count]) => count >= MIN_TITLES_FOR_YIR)
    .map(([id]) => id);

  if (eligibleIds.length === 0) {
    return NextResponse.json({ year, notified: 0, skipped: 0, total: 0 });
  }

  // Fetch user records + check for prior unlock notifications in one round-trip.
  const [users, alreadyNotified] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: eligibleIds } },
      select: {
        id: true, name: true, email: true, firebaseUid: true,
        emailPrefs: true, emailOptOut: true,
      },
    }),
    prisma.notification.findMany({
      where: {
        userId: { in: eligibleIds },
        type: "yir_unlock",
        targetType,
        targetId,
      },
      select: { userId: true },
    }),
  ]);
  const alreadyNotifiedSet = new Set(alreadyNotified.map((n) => n.userId));

  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.theratist.com";

  let notified = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const user of users) {
    if (alreadyNotifiedSet.has(user.id)) { skipped++; continue; }

    const link = `/profile/${user.firebaseUid}/year-in-review/${year}`;

    // In-app notification — always fire (respects per-user notification
    // prefs internally via notify()).
    await notify({
      recipientId: user.id,
      actorId: null,
      type: "yir_unlock",
      targetType,
      targetId,
      message: `Your ${year} in Film is here — see your year on The Ratist.`,
      link,
      allowSelfNotify: true,
    });

    // Email — gated on the user's promotional pref + a valid address.
    if (user.email && shouldSendEmail(user.emailPrefs, user.emailOptOut, "promotional")) {
      try {
        await sendEmail({
          to: user.email,
          subject: `Your ${year} in Film is here`,
          html: yirUnlockEmailHtml({ name: user.name, year, link: `${SITE_URL}${link}` }),
        });
      } catch (err) {
        errors.push(`${user.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    notified++;
  }

  return NextResponse.json({ year, notified, skipped, total: users.length, errors: errors.slice(0, 10) });
}

function yirUnlockEmailHtml({ name, year, link }: { name: string; year: number; link: string }): string {
  // Self-contained branded markup mirroring the wrap() helper in lib/email.ts.
  // Kept inline so this cron isn't a leaf consumer of an internal helper.
  return `
    <div style="background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#141414;border:1px solid #222;border-radius:14px;padding:32px;color:#ccc;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:4px;color:#CC0033;text-transform:uppercase;">Your ${year} is in</p>
        <h2 style="margin:0 0 16px;font-size:30px;font-weight:900;color:#fff;line-height:1.1;">${year} in Film</h2>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#ccc;">Hey ${name},</p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#ccc;">Your Year in Review is live. See your top 5, your most controversial take, the genre you couldn't stay away from, and a single archetype that captures your ${year} in cinema.</p>
        <div style="margin:24px 0;text-align:center;">
          <a href="${link}" style="display:inline-block;background:#CC0033;color:#fff;font-weight:700;font-size:15px;padding:12px 24px;border-radius:999px;text-decoration:none;">See My ${year} in Film</a>
        </div>
        <p style="margin:0;font-size:13px;color:#666;">The page stays live — keep watching and rating, and it'll keep updating through December.</p>
      </div>
    </div>
  `;
}
