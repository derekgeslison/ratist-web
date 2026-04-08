import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { adminAuth, adminStorage, getAdminApp } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const LIKELIHOOD_RANK: Record<string, number> = {
  UNKNOWN: 0, VERY_UNLIKELY: 0, UNLIKELY: 1, POSSIBLE: 2, LIKELY: 3, VERY_LIKELY: 4,
};

async function checkSafeSearch(imageBase64: string): Promise<{ safe: boolean; reason?: string }> {
  try {
    const credential = getAdminApp().options.credential!;
    const tokenResult = await credential.getAccessToken();
    const response = await fetch("https://vision.googleapis.com/v1/images:annotate", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenResult.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: [{ image: { content: imageBase64 }, features: [{ type: "SAFE_SEARCH_DETECTION" }] }] }),
    });
    if (!response.ok) { console.warn("Vision API unavailable:", response.status); return { safe: true }; }
    const data = await response.json();
    const annotation = data.responses?.[0]?.safeSearchAnnotation;
    if (!annotation) return { safe: true };
    if ((LIKELIHOOD_RANK[annotation.adult] ?? 0) >= 3) return { safe: false, reason: "Image contains adult content." };
    if ((LIKELIHOOD_RANK[annotation.racy] ?? 0) >= 3) return { safe: false, reason: "Image contains explicit content." };
    if ((LIKELIHOOD_RANK[annotation.violence] ?? 0) >= 4) return { safe: false, reason: "Image contains graphic violence." };
    return { safe: true };
  } catch (err) {
    console.warn("Vision API error:", err);
    return { safe: true };
  }
}

export async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const dbUser = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") return NextResponse.json({ error: "No file provided" }, { status: 400 });

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Unsupported file type. Use JPEG, PNG, or WebP." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: "File too large. Maximum size is 5 MB." }, { status: 400 });
    }

    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");

    const { safe, reason } = await checkSafeSearch(base64);
    if (!safe) return NextResponse.json({ error: reason ?? "Image rejected by content policy." }, { status: 422 });

    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    const filePath = `headers/${dbUser.id}-${Date.now()}.${ext}`;
    const bucket = adminStorage.bucket();
    const storageFile = bucket.file(filePath);

    await storageFile.save(buffer, { metadata: { contentType: file.type }, resumable: false });
    await storageFile.makePublic();

    const headerImageUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    // Save into profileTheme JSON
    const currentTheme = (dbUser.profileTheme as Record<string, unknown>) ?? {};
    await prisma.user.update({
      where: { id: dbUser.id },
      data: { profileTheme: { ...currentTheme, headerImage: headerImageUrl } },
    });

    return NextResponse.json({ headerImageUrl });
  } catch (err) {
    console.error("Header image upload error:", err);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const dbUser = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const currentTheme = (dbUser.profileTheme as Record<string, unknown>) ?? {};
    const { headerImage: _removed, ...rest } = currentTheme;
    await prisma.user.update({
      where: { id: dbUser.id },
      data: { profileTheme: Object.keys(rest).length > 0 ? (rest as Prisma.InputJsonValue) : Prisma.DbNull },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Header image delete error:", err);
    return NextResponse.json({ error: "Failed to remove header image." }, { status: 500 });
  }
}
