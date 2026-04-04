import { prisma } from "@/lib/prisma";

export async function logAdminAction(adminId: string, action: string, targetId?: string | null, details?: string | null) {
  await prisma.adminLog.create({
    data: { adminId, action, targetId: targetId ?? null, details: details ?? null },
  }).catch((err) => console.error("Admin log error:", err));
}
