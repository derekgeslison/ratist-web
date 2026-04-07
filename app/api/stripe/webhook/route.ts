import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

function getStripe() { return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-04-30.basil" }); }

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig!, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        if (userId && session.subscription) {
          await prisma.user.update({
            where: { id: userId },
            data: {
              subscriptionTier: "backstage_pass",
              subscriptionStatus: "active",
              stripeSubscriptionId: session.subscription as string,
              subscriptionExpiry: null, // Stripe manages the lifecycle
            },
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const user = await prisma.user.findFirst({
          where: { stripeCustomerId: sub.customer as string },
        });
        if (user) {
          const status = sub.status === "active" ? "active"
            : sub.status === "past_due" ? "past_due"
            : sub.cancel_at_period_end ? "canceled"
            : sub.status;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              subscriptionStatus: status,
              stripeSubscriptionId: sub.id,
              subscriptionExpiry: sub.cancel_at ? new Date(sub.cancel_at * 1000) : null,
            },
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const user = await prisma.user.findFirst({
          where: { stripeCustomerId: sub.customer as string },
        });
        if (user) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              subscriptionTier: null,
              subscriptionStatus: null,
              stripeSubscriptionId: null,
              subscriptionExpiry: null,
            },
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const user = await prisma.user.findFirst({
          where: { stripeCustomerId: invoice.customer as string },
        });
        if (user) {
          await prisma.user.update({
            where: { id: user.id },
            data: { subscriptionStatus: "past_due" },
          });
        }
        break;
      }
    }
  } catch (err) {
    console.error("Webhook processing error:", err);
  }

  return NextResponse.json({ received: true });
}
