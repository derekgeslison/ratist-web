import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminStorage, getAdminApp } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// Likelihood values from Vision API, ordered by severity
const LIKELIHOOD_RANK: Record<string, number> = {
  UNKNOWN: 0,
  VERY_UNLIKELY: 0,
  UNLIKELY: 1,
  POSSIBLE: 2,
  LIKELY: 3,
  VERY_LIKELY: 4,
};

async function checkSafeSearch(imageBase64: string): Promise<{ safe: boolean; reason?: string }> {
  try {
    // Get OAuth2 access token from the service account credential
    const credential = getAdminApp().options.credential!;
    const tokenResult = await credential.getAccessToken();
    const accessToken = tokenResult.access_token;

    const response = await fetch(
      "https://vision.googleapis.com/v1/images:annotate",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [
            {
              image: { content: imageBase64 },
              features: [{ type: "SAFE_SEARCH_DETECTION" }],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      // If Vision API is unavailable, allow upload but log the issue
      console.warn("Vision API unavailable, skipping moderation:", response.status);
      return { safe: true };
    }

    const data = await response.json();
    const annotation = data.responses?.[0]?.safeSearchAnnotation;
    if (!annotation) return { safe: true };

    const adultRank = LIKELIHOOD_RANK[annotation.adult] ?? 0;
    const racyRank = LIKELIHOOD_RANK[annotation.racy] ?? 0;
    const violenceRank = LIKELIHOOD_RANK[annotation.violence] ?? 0;

    // Reject LIKELY or VERY_LIKELY for adult/racy content
    if (adultRank >= 3) return { safe: false, reason: "Image contains adult content." };
    if (racyRank >= 3) return { safe: false, reason: "Image contains explicit content." };
    if (violenceRank >= 4) return { safe: false, reason: "Image contains graphic violence." };

    return { safe: true };
  } catch (err) {
    console.warn("Vision API error, skipping moderation:", err);
    return { safe: true }; // Fail open — don't block uploads if Vision is down
  }
}

export async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const dbUser = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Unsupported file type. Use JPEG, PNG, WebP, or GIF." },
        { status: 400 }
      );
    }

    // Validate size
    const arrayBuffer = await file.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: "File too large. Maximum size is 5 MB." }, { status: 400 });
    }

    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");

    // Run SafeSearch moderation
    const { safe, reason } = await checkSafeSearch(base64);
    if (!safe) {
      return NextResponse.json({ error: reason ?? "Image rejected by content policy." }, { status: 422 });
    }

    // Upload to Firebase Storage
    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    const filePath = `avatars/${dbUser.id}.${ext}`;
    const bucket = adminStorage.bucket();
    const storageFile = bucket.file(filePath);

    await storageFile.save(buffer, {
      metadata: { contentType: file.type },
      resumable: false,
    });

    await storageFile.makePublic();

    const bucketName = bucket.name;
    const avatarUrl = `https://storage.googleapis.com/${bucketName}/${filePath}`;

    // Save URL to DB
    await prisma.user.update({
      where: { id: dbUser.id },
      data: { avatarUrl },
    });

    return NextResponse.json({ avatarUrl });
  } catch (err) {
    console.error("Avatar upload error:", err);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
