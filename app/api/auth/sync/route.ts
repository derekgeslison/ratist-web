import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { scanPosterSafeSearch, shouldBlockAvatar } from "@/lib/vision-safesearch";

function generateInviteCode(): string {
  return "R-" + crypto.randomBytes(4).toString("hex").slice(0, 7);
}

export async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authorization.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);
    const { name, email, avatarUrl, restoreAction } = await req.json();

    // Defensive: even if the client falls back to an email-derived name
    // for some reason, never persist the local part of an Apple Hide-My-
    // Email relay address as the user's display name. That would leak
    // the relay email to anyone who can see the username. Replace with
    // a placeholder; onboarding will prompt for a real name on step 1.
    let safeName: string | null = name ?? null;
    const persistEmail = email ?? decoded.email ?? "";
    if (safeName && persistEmail.toLowerCase().endsWith("@privaterelay.appleid.com")) {
      const local = persistEmail.split("@")[0];
      if (safeName === local) safeName = "User";
    }

    // Check if user exists and is soft-deleted
    const existing = await prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
      select: { id: true, deletedAt: true, bannedAt: true, bannedUntil: true, banReason: true },
    });

    if (existing?.deletedAt) {
      // Check if past 30 days — if so, treat as permanently deleted
      const daysSinceDelete = (Date.now() - new Date(existing.deletedAt).getTime()) / 86400000;

      if (daysSinceDelete >= 30) {
        // Past retention period — permanently delete and let them create fresh
        await prisma.user.delete({ where: { id: existing.id } });
        // Fall through to create new account below
      } else if (restoreAction === "restore") {
        // User chose to restore their old account
        await prisma.user.update({
          where: { id: existing.id },
          data: { deletedAt: null, deletedBy: null },
        });
        // Re-enable Firebase account
        try { await adminAuth.updateUser(decoded.uid, { disabled: false }); } catch { /* ignore */ }
        const user = await prisma.user.findUnique({ where: { id: existing.id } });
        return NextResponse.json({ user, restored: true });
      } else if (restoreAction === "fresh") {
        // User chose to start fresh — delete old data and recreate
        await prisma.user.delete({ where: { id: existing.id } });
        // Fall through to create new account below
      } else {
        // No action yet — tell the client the account is deleted and needs a choice
        const daysLeft = Math.max(0, 30 - Math.floor(daysSinceDelete));
        return NextResponse.json({
          deleted: true,
          daysLeft,
          message: `Your account was deleted. You have ${daysLeft} day${daysLeft !== 1 ? "s" : ""} to restore it before permanent deletion.`,
        });
      }
    }

    // Check if banned
    if (existing?.bannedAt) {
      const banExpired = existing.bannedUntil && new Date(existing.bannedUntil) < new Date();
      if (banExpired) {
        // Auto-unban
        await prisma.user.update({
          where: { id: existing.id },
          data: { bannedAt: null, bannedUntil: null, banReason: null },
        });
      } else {
        return NextResponse.json({
          banned: true,
          bannedUntil: existing.bannedUntil,
          banReason: existing.banReason,
          message: existing.bannedUntil
            ? `Your account is suspended until ${new Date(existing.bannedUntil).toLocaleDateString()}.`
            : "Your account has been suspended.",
        });
      }
    }

    // Normal upsert — create or update.
    //
    // `name` and `avatarUrl` are ONLY set on creation. Once the user
    // exists, we never overwrite them from the auth provider — the
    // user owns those values via Settings. Without this, signing in
    // through Google after customizing the name (or after originally
    // signing up via email/password) would clobber the custom display
    // name with the Google-account name on every login. Same for the
    // avatar with the Google profile photo.
    //
    // Email is intentionally also untouched on update — the upsert
    // key is firebaseUid, so the email captured at first sign-up is
    // the canonical one. If the user changes their auth email later
    // they'll need a separate flow to migrate.
    // Google / Apple sign-in supplies a remote photoURL. We never
    // ran SafeSearch on those, so explicit-content avatars could slip
    // in via OAuth even though user-uploaded avatars are scanned.
    // Scan the URL through Vision and drop it if it crosses the same
    // threshold the upload route uses. Fail-open: a Vision timeout
    // shouldn't block account creation. Only runs on new accounts
    // (the update branch is empty by design).
    let safeAvatarUrl: string | null = avatarUrl ?? null;
    if (!existing && safeAvatarUrl) {
      try {
        const verdict = await scanPosterSafeSearch(safeAvatarUrl);
        if (verdict && shouldBlockAvatar(verdict)) {
          console.warn(
            "[auth/sync] OAuth avatar blocked by SafeSearch; persisting null",
            { uid: decoded.uid, verdict },
          );
          safeAvatarUrl = null;
        }
      } catch (err) {
        // Don't block sign-up if Vision is down. Logged so we can
        // see if the path is consistently failing.
        console.warn("[auth/sync] SafeSearch on OAuth avatar threw; allowing:", err);
      }
    }

    const user = await prisma.user.upsert({
      where: { firebaseUid: decoded.uid },
      create: {
        firebaseUid: decoded.uid,
        name: safeName ?? "User",
        email: persistEmail,
        avatarUrl: safeAvatarUrl,
        inviteCode: generateInviteCode(),
        profile: { create: {} },
      },
      // Empty update — every login still hits this code path so the
      // upsert returns the row, but no fields are overwritten.
      update: {},
    });

    return NextResponse.json({ user, needsOnboarding: !user.onboardedAt });
  } catch (err) {
    console.error("Auth sync error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
