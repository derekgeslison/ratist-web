import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser, canDelete } from "@/lib/auth-helpers";

interface Props {
  params: Promise<{ id: string }>;
}

export async function DELETE(req: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const pitch = await prisma.moviePitch.findUnique({ where: { id } });
    if (!pitch) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canDelete(user, pitch.authorId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await prisma.moviePitch.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("Pitch DELETE error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
