import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const VALID_CATEGORIES = ["general", "advertising", "press", "partnerships", "dmca", "other"];

// Loose RFC-5322-ish check. Server-side validation only — the form
// already does HTML5 type=email on the client.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const { category, name, email, company, subject, message } = body;

  if (!category || !VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }
  if (typeof name !== "string" || !name.trim() || name.length > 120) {
    return NextResponse.json({ error: "Name is required (max 120 characters)" }, { status: 400 });
  }
  if (typeof email !== "string" || !email.trim() || email.length > 254 || !EMAIL_RE.test(email.trim())) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (typeof message !== "string" || !message.trim() || message.length > 5000) {
    return NextResponse.json({ error: "Message is required (max 5,000 characters)" }, { status: 400 });
  }
  if (company != null && (typeof company !== "string" || company.length > 160)) {
    return NextResponse.json({ error: "Company name too long" }, { status: 400 });
  }
  if (subject != null && (typeof subject !== "string" || subject.length > 200)) {
    return NextResponse.json({ error: "Subject too long" }, { status: 400 });
  }

  const contact = await prisma.contact.create({
    data: {
      category,
      name: name.trim(),
      email: email.trim(),
      company: company?.trim() || null,
      subject: subject?.trim() || null,
      message: message.trim(),
    },
  });

  return NextResponse.json({ contact: { id: contact.id } });
}
