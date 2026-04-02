import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser, canDelete } from "@/lib/auth-helpers";

interface Props {
  params: Promise<{ id: string }>;
}

/** DELETE /api/community/recast/[id] — delete a recast post */
export async function DELETE(req: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const recast = await prisma.recast.findUnique({ where: { id } });
    if (!recast) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canDelete(user, recast.creatorId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await prisma.recast.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("Recast DELETE error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
