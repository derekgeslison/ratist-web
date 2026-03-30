import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import type { PostType } from "@prisma/client";

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user?.isAdmin) return null;
  return user;
}

function slugify(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

async function uniqueSlug(base: string, excludeId?: string) {
  let slug = base;
  let n = 0;
  while (true) {
    const existing = await prisma.blogPost.findUnique({ where: { slug } });
    if (!existing || existing.id === excludeId) return slug;
    n++;
    slug = `${base}-${n}`;
  }
}

export async function GET(req: NextRequest) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") as PostType | null;

  const posts = await prisma.blogPost.findMany({
    where: type ? { type } : undefined,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, type: true, title: true, slug: true,
      published: true, createdAt: true, updatedAt: true, viewCount: true,
      author: { select: { name: true } },
    },
  });

  return NextResponse.json({ posts });
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin(req);
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { title, type = "BLOG", content, excerpt, coverImage, published = false } = body;
    if (!title || !content) return NextResponse.json({ error: "title and content required" }, { status: 400 });

    const slug = await uniqueSlug(slugify(title));
    const post = await prisma.blogPost.create({
      data: {
        authorId: user.id,
        title,
        type: type as PostType,
        slug,
        content,
        excerpt: excerpt ?? null,
        coverImage: coverImage ?? null,
        published,
      },
    });

    return NextResponse.json({ post }, { status: 201 });
  } catch (err) {
    console.error("Create post error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
