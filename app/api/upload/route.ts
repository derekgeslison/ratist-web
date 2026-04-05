import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminStorage } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.isAdmin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Allowed: JPEG, PNG, WebP, GIF" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large. Max 5MB" }, { status: 400 });
    }

    const ext = file.name.split(".").pop() ?? "jpg";
    const filename = `uploads/${randomUUID()}.${ext}`;

    const bucket = adminStorage.bucket();
    const blob = bucket.file(filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await blob.save(buffer, {
      metadata: {
        contentType: file.type,
        metadata: { uploadedBy: user.id },
      },
    });

    await blob.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;

    return NextResponse.json({ url: publicUrl });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
