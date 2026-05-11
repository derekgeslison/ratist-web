import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
      select: { id: true, name: true, email: true, avatarUrl: true, bio: true, isPrivate: true, autoDateOnSeen: true, autoSeenOnWatchlistCheck: true, publicTabs: true, notificationPrefs: true, profileTheme: true, emailOptOut: true, emailPrefs: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    return NextResponse.json({ user });
  } catch (err) {
    console.error("Profile me GET error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const dbUser = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { name, avatarUrl, bio, isPrivate, autoDateOnSeen, autoSeenOnWatchlistCheck, publicTabs, notificationPrefs, profileTheme, emailOptOut, emailPrefs, watchlistStreamingNotifs } = await req.json();
    const update: Record<string, unknown> = {};
    if (typeof name === "string" && name.trim()) update.name = name.trim();
    if (typeof avatarUrl === "string") update.avatarUrl = avatarUrl.trim() || null;
    if (typeof bio === "string") update.bio = bio.trim() || null;
    if (typeof isPrivate === "boolean") update.isPrivate = isPrivate;
    if (typeof autoDateOnSeen === "boolean") update.autoDateOnSeen = autoDateOnSeen;
    if (typeof autoSeenOnWatchlistCheck === "boolean") update.autoSeenOnWatchlistCheck = autoSeenOnWatchlistCheck;
    if (publicTabs && typeof publicTabs === "object") update.publicTabs = publicTabs;
    if (typeof notificationPrefs === "object" && notificationPrefs !== null) update.notificationPrefs = notificationPrefs;
    if (typeof profileTheme === "object") update.profileTheme = profileTheme;
    if (typeof emailOptOut === "boolean") update.emailOptOut = emailOptOut;
    if (typeof emailPrefs === "object" && emailPrefs !== null) update.emailPrefs = emailPrefs;
    if (typeof watchlistStreamingNotifs === "boolean") update.watchlistStreamingNotifs = watchlistStreamingNotifs;

    const updated = await prisma.user.update({
      where: { id: dbUser.id },
      data: update,
      select: { id: true, name: true, avatarUrl: true, bio: true, isPrivate: true, autoDateOnSeen: true, autoSeenOnWatchlistCheck: true, publicTabs: true, notificationPrefs: true, profileTheme: true },
    });

    return NextResponse.json({ user: updated });
  } catch (err) {
    console.error("Profile me PATCH error:", err);
    // Surface the underlying error in dev so the browser can show it
    // — production keeps the generic message. Remove the `detail` once
    // the bug is pinned.
    const isDev = process.env.NODE_ENV !== "production";
    return NextResponse.json({
      error: "Server error",
      detail: isDev ? (err instanceof Error ? err.message : String(err)) : undefined,
    }, { status: 500 });
  }
}
