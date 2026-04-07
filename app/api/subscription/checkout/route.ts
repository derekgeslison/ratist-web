import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

function getStripe() { return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-04-30.basil" }); }

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { plan } = await req.json(); // "monthly" | "annual"
    const priceId = plan === "annual"
      ? process.env.STRIPE_PRICE_ANNUAL
      : process.env.STRIPE_PRICE_MONTHLY;

    if (!priceId) return NextResponse.json({ error: "Price not configured" }, { status: 500 });

    // Get or create Stripe customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await getStripe().customers.create({
        email: user.email ?? undefined,
        name: user.name,
        metadata: { userId: user.id, firebaseUid: user.firebaseUid },
      });
      customerId = customer.id;
      const { prisma } = await import("@/lib/prisma");
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/backstage-pass?success=1`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/backstage-pass?canceled=1`,
      metadata: { userId: user.id },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Checkout error:", err);
    return NextResponse.json({ error: "Failed to create checkout" }, { status: 500 });
  }
}
