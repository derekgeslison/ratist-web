import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

function getStripe() { return new Stripe(process.env.STRIPE_SECRET_KEY!); }

export async function POST(req: NextRequest) {
  try {
    // Check env vars
    if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: "STRIPE_SECRET_KEY not configured" }, { status: 500 });

    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // fromIos: set by SubscriptionPanel when the user arrived via the
    // iOS app's "Subscribe on the web" link. We thread it through
    // Stripe's success_url so the post-checkout landing page knows to
    // render a "Return to The Ratist app" button.
    const { plan, fromIos } = await req.json(); // "monthly" | "annual"
    const priceId = plan === "annual"
      ? process.env.STRIPE_PRICE_ANNUAL
      : process.env.STRIPE_PRICE_MONTHLY;

    if (!priceId) return NextResponse.json({ error: `Price not configured for ${plan}. STRIPE_PRICE_ANNUAL=${process.env.STRIPE_PRICE_ANNUAL ? "set" : "unset"}, STRIPE_PRICE_MONTHLY=${process.env.STRIPE_PRICE_MONTHLY ? "set" : "unset"}` }, { status: 500 });

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

    // If the user has an admin-granted Backstage Pass that expires in the
    // future, start the new Stripe subscription as a trial that ends when
    // their free period does. Stripe requires trial_end to be at least 48h
    // in the future — if it's closer than that, fall back to immediate billing.
    const now = Date.now();
    const minTrialMs = 48 * 60 * 60 * 1000;
    let trialEnd: number | undefined;
    if (
      user.subscriptionStatus === "admin_granted" &&
      user.subscriptionExpiry &&
      new Date(user.subscriptionExpiry).getTime() - now > minTrialMs
    ) {
      trialEnd = Math.floor(new Date(user.subscriptionExpiry).getTime() / 1000);
    }

    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/backstage-pass?success=1${fromIos ? "&from=ios" : ""}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/backstage-pass?canceled=1${fromIos ? "&from=ios" : ""}`,
      metadata: { userId: user.id },
      ...(trialEnd ? { subscription_data: { trial_end: trialEnd } } : {}),
    });

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Checkout error:", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
