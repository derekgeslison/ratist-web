import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser, canDelete } from "@/lib/auth-helpers";

interface Props {
  params: Promise<{ id: string }>;
}

/** DELETE /api/community/looks-like/[id] — delete a looks-like post */
export async function DELETE(req: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const looksLike = await prisma.looksLike.findUnique({ where: { id } });
    if (!looksLike) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canDelete(user, looksLike.creatorId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await prisma.looksLike.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("LooksLike DELETE error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
