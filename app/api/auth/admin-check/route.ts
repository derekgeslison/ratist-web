import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/** GET /api/auth/admin-check — lightweight admin status check */
export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ isAdmin: false });
  return NextResponse.json({ isAdmin: user.isAdmin });
}
