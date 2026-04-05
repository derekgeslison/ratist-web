import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user?.isAdmin) return null;
  return user;
}

// GET: return all site config
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const configs = await prisma.siteConfig.findMany();
  const result: Record<string, string> = {};
  for (const c of configs) result[c.key] = c.value;
  return NextResponse.json(result);
}

// PUT: update a config value
export async function PUT(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { key, value } = await req.json();
  if (!key || value === undefined) return NextResponse.json({ error: "key and value required" }, { status: 400 });

  await prisma.siteConfig.upsert({
    where: { key },
    create: { key, value: typeof value === "string" ? value : JSON.stringify(value) },
    update: { value: typeof value === "string" ? value : JSON.stringify(value) },
  });

  return NextResponse.json({ ok: true });
}
