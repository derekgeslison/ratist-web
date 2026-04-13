import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/test-email
 * Admin-only endpoint to test that Resend email delivery is working.
 * Sends a test email to the requesting admin's own email address.
 */
export async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.isAdmin) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const email = decoded.email;
    if (!email) {
      return NextResponse.json({ error: "No email on account" }, { status: 400 });
    }

    const success = await sendEmail({
      to: email,
      subject: "Ratist Email Test — It works!",
      html: `
        <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e0e0e0;background:#0a0a0a;padding:32px;border-radius:12px;">
          <div style="text-align:center;margin-bottom:24px;">
            <span style="color:#e63946;font-weight:800;font-size:18px;letter-spacing:1px;">THE RATIST</span>
          </div>
          <h2 style="color:white;margin:0 0 8px;">Email delivery is working!</h2>
          <p>This is a test email sent from The Ratist via Resend.</p>
          <p style="color:#888;font-size:13px;">Sent to: ${email}</p>
          <p style="color:#888;font-size:13px;">Time: ${new Date().toISOString()}</p>
          <p style="color:#888;font-size:13px;">RESEND_API_KEY: configured ✓</p>
        </div>
      `,
    });

    if (success) {
      return NextResponse.json({ ok: true, sentTo: email });
    } else {
      return NextResponse.json({ error: "Email send failed — check server logs for details" }, { status: 500 });
    }
  } catch (err) {
    console.error("Test email error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
