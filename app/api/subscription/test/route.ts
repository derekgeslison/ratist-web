import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, string> = {};

  checks.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ? `set (${process.env.STRIPE_SECRET_KEY.slice(0, 10)}...)` : "MISSING";
  checks.STRIPE_PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY ?? "MISSING";
  checks.STRIPE_PRICE_ANNUAL = process.env.STRIPE_PRICE_ANNUAL ?? "MISSING";
  checks.NEXT_PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "MISSING";

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const prices = await stripe.prices.list({ limit: 2 });
    checks.stripe_connection = `OK — found ${prices.data.length} prices`;
    checks.price_ids = prices.data.map(p => p.id).join(", ");
  } catch (err: unknown) {
    checks.stripe_connection = `FAILED: ${err instanceof Error ? err.message : String(err)}`;
  }

  return NextResponse.json(checks);
}
