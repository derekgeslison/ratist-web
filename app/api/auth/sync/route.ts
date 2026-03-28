import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authorization.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);
    const { name, email, avatarUrl } = await req.json();

    const user = await prisma.user.upsert({
      where: { firebaseUid: decoded.uid },
      create: {
        firebaseUid: decoded.uid,
        name: name ?? "User",
        email: email ?? decoded.email ?? "",
        avatarUrl: avatarUrl ?? null,
        profile: { create: {} },
      },
      update: {
        name: name ?? undefined,
        avatarUrl: avatarUrl ?? undefined,
      },
    });

    return NextResponse.json({ user });
  } catch (err) {
    console.error("Auth sync error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
