import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/admin-log";
import { sendBanNotification } from "@/lib/email";

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user?.isAdmin) return null;
  return user;
}

// GET /api/admin/moderation?status=pending|dismissed|resolved
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const status = req.nextUrl.searchParams.get("status") ?? "pending";

  const reports = await prisma.report.findMany({
    where: { status },
    include: {
      reporter: { select: { id: true, name: true, avatarUrl: true } },
      resolver: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Fetch content previews for each report
  const enriched = await Promise.all(
    reports.map(async (r) => {
      let contentPreview: string | null = null;
      let contentAuthor: { id: string; name: string; firebaseUid: string } | null = null;

      try {
        if (r.targetType === "review") {
          const rating = await prisma.movieRating.findUnique({
            where: { id: r.targetId },
            select: { reviewText: true, user: { select: { id: true, name: true, firebaseUid: true } }, movie: { select: { title: true } } },
          });
          contentPreview = rating ? `Review of "${rating.movie.title}": ${rating.reviewText?.slice(0, 200) ?? "(no text)"}` : "(deleted)";
          contentAuthor = rating?.user ?? null;
        } else if (r.targetType === "comment") {
          const comment = await prisma.comment.findUnique({
            where: { id: r.targetId },
            select: { text: true, user: { select: { id: true, name: true, firebaseUid: true } } },
          });
          contentPreview = comment ? comment.text.slice(0, 200) : "(deleted)";
          contentAuthor = comment?.user ?? null;
        } else if (r.targetType === "forumPost") {
          const post = await prisma.forumPost.findUnique({
            where: { id: r.targetId },
            select: { content: true, author: { select: { id: true, name: true, firebaseUid: true } } },
          });
          contentPreview = post ? post.content.slice(0, 200) : "(deleted)";
          contentAuthor = post?.author ?? null;
        } else if (r.targetType === "hotTake") {
          const take = await prisma.hotTake.findUnique({
            where: { id: r.targetId },
            select: { content: true, author: { select: { id: true, name: true, firebaseUid: true } } },
          });
          contentPreview = take ? take.content.slice(0, 200) : "(deleted)";
          contentAuthor = take?.author ?? null;
        } else if (r.targetType === "recast") {
          const recast = await prisma.recast.findUnique({
            where: { id: r.targetId },
            select: { id: true, creator: { select: { id: true, name: true, firebaseUid: true } } },
          });
          contentPreview = recast ? `Recast suggestion #${recast.id}` : "(deleted)";
          contentAuthor = recast?.creator ?? null;
        } else if (r.targetType === "looksLike") {
          const ll = await prisma.looksLike.findUnique({
            where: { id: r.targetId },
            select: { name1: true, name2: true, creator: { select: { id: true, name: true, firebaseUid: true } } },
          });
          contentPreview = ll ? `${ll.name1} / ${ll.name2}` : "(deleted)";
          contentAuthor = ll?.creator ?? null;
        } else if (r.targetType === "companion_suggestion") {
          // Reported approved suggestion — show enough for an admin to
          // judge it without leaving moderation. Author is the submitter
          // (the person responsible for the bad content), so suspending
          // them via the existing ban flow handles the troll case.
          const sug = await prisma.companionSuggestion.findUnique({
            where: { id: r.targetId },
            select: {
              action: true,
              targetType: true,
              rationale: true,
              payload: true,
              companion: { select: { title: true, mediaType: true } },
              submitter: { select: { id: true, name: true, firebaseUid: true } },
            },
          });
          if (sug) {
            const payloadStr = sug.payload && typeof sug.payload === "object"
              ? JSON.stringify(sug.payload).slice(0, 200)
              : "(no payload)";
            const rationale = sug.rationale ? ` — "${sug.rationale.slice(0, 100)}"` : "";
            contentPreview = `${sug.action} ${sug.targetType} on "${sug.companion.title}": ${payloadStr}${rationale}`;
            contentAuthor = sug.submitter;
          } else {
            contentPreview = "(suggestion deleted)";
          }
        }
      } catch { /* content may not exist */ }

      return {
        ...r,
        contentPreview,
        contentAuthor,
      };
    })
  );

  return NextResponse.json({ reports: enriched });
}

// PATCH /api/admin/moderation — resolve a report
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { reportId, action, banReason, banDays, removeContent } = await req.json();
  if (!reportId || !action) return NextResponse.json({ error: "reportId and action required" }, { status: 400 });

  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  // Determine new status based on action
  let newStatus = "dismissed";

  if (action === "dismiss") {
    newStatus = "dismissed";
  } else if (action === "remove") {
    newStatus = "removed";
    // Delete the reported content
    await deleteContent(report.targetType, report.targetId);
  } else if (action === "warn") {
    newStatus = "warned";
    await deleteContent(report.targetType, report.targetId);
    // TODO: could send a notification to the user
  } else if (action === "ban") {
    newStatus = "banned";
    await deleteContent(report.targetType, report.targetId);
    // Find content author and ban them
    const authorId = await getContentAuthorId(report.targetType, report.targetId);
    if (authorId) {
      const banUntil = banDays ? new Date(Date.now() + Number(banDays) * 86400000) : null;
      const reason = banReason || "Violation of community guidelines";
      const bannedUser = await prisma.user.update({
        where: { id: authorId },
        data: { bannedAt: new Date(), bannedUntil: banUntil, banReason: reason },
        select: { id: true, email: true, name: true },
      });
      if (bannedUser.email) {
        sendBanNotification(bannedUser.email, bannedUser.name, bannedUser.id, reason, banUntil).catch(() => {});
      }
      if (removeContent) {
        // Bulk remove all content from this user
        await Promise.all([
          prisma.movieRating.updateMany({ where: { userId: authorId, reviewText: { not: null } }, data: { reviewText: null } }),
          prisma.comment.deleteMany({ where: { userId: authorId } }),
          prisma.forumPost.deleteMany({ where: { authorId } }),
          prisma.hotTake.deleteMany({ where: { authorId } }),
          prisma.recast.deleteMany({ where: { creatorId: authorId } }),
          prisma.looksLike.deleteMany({ where: { creatorId: authorId } }),
        ]);
      }
    }
  }

  // Update report status
  await prisma.report.update({
    where: { id: reportId },
    data: { status: newStatus, resolvedBy: admin.id, resolvedAt: new Date() },
  });

  // Also resolve any other pending reports on the same content
  await prisma.report.updateMany({
    where: { targetType: report.targetType, targetId: report.targetId, status: "pending", id: { not: reportId } },
    data: { status: newStatus, resolvedBy: admin.id, resolvedAt: new Date() },
  });

  await logAdminAction(admin.id, "resolveReport", reportId, `${action} report on ${report.targetType}/${report.targetId}`);

  return NextResponse.json({ ok: true });
}

async function deleteContent(targetType: string, targetId: string) {
  try {
    if (targetType === "review") {
      await prisma.movieRating.update({ where: { id: targetId }, data: { reviewText: null } });
    } else if (targetType === "comment") {
      await prisma.comment.delete({ where: { id: targetId } });
    } else if (targetType === "forumPost") {
      await prisma.forumPost.delete({ where: { id: targetId } });
    } else if (targetType === "hotTake") {
      await prisma.hotTake.delete({ where: { id: targetId } });
    } else if (targetType === "recast") {
      await prisma.recast.delete({ where: { id: targetId } });
    } else if (targetType === "looksLike") {
      await prisma.looksLike.delete({ where: { id: targetId } });
    }
  } catch { /* content may already be deleted */ }
}

async function getContentAuthorId(targetType: string, targetId: string): Promise<string | null> {
  try {
    if (targetType === "review") {
      const r = await prisma.movieRating.findUnique({ where: { id: targetId }, select: { userId: true } });
      return r?.userId ?? null;
    } else if (targetType === "comment") {
      const c = await prisma.comment.findUnique({ where: { id: targetId }, select: { userId: true } });
      return c?.userId ?? null;
    } else if (targetType === "forumPost") {
      const p = await prisma.forumPost.findUnique({ where: { id: targetId }, select: { authorId: true } });
      return p?.authorId ?? null;
    } else if (targetType === "hotTake") {
      const t = await prisma.hotTake.findUnique({ where: { id: targetId }, select: { authorId: true } });
      return t?.authorId ?? null;
    } else if (targetType === "recast") {
      const r = await prisma.recast.findUnique({ where: { id: targetId }, select: { creatorId: true } });
      return r?.creatorId ?? null;
    } else if (targetType === "looksLike") {
      const l = await prisma.looksLike.findUnique({ where: { id: targetId }, select: { creatorId: true } });
      return l?.creatorId ?? null;
    } else if (targetType === "companion_suggestion") {
      // Author of a reported companion suggestion is the submitter — the
      // user who proposed (and got auto-approved or admin-approved into)
      // the change. Banning them via the moderation flow blocks future
      // suggestions.
      const s = await prisma.companionSuggestion.findUnique({ where: { id: targetId }, select: { submitterId: true } });
      return s?.submitterId ?? null;
    }
  } catch { /* ignore */ }
  return null;
}
