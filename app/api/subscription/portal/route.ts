import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

function getStripe() { return new Stripe(process.env.STRIPE_SECRET_KEY!); }

/** POST — create a Stripe Customer Portal session for managing subscription */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user || !user.stripeCustomerId) {
      return NextResponse.json({ error: "No subscription found" }, { status: 400 });
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_SITE_URL}/backstage-pass`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Portal error:", err);
    return NextResponse.json({ error: "Failed to create portal" }, { status: 500 });
  }
}
