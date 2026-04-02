import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser, canDelete } from "@/lib/auth-helpers";

interface Props {
  params: Promise<{ id: string }>;
}

/** DELETE /api/community/hot-takes/[id] — delete a hot take */
export async function DELETE(req: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const hotTake = await prisma.hotTake.findUnique({ where: { id } });
    if (!hotTake) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canDelete(user, hotTake.authorId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await prisma.hotTake.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("HotTake DELETE error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
