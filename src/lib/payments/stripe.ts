import "server-only";
import Stripe from "stripe";
import { env } from "@/lib/env";
import type { CheckoutRequest, CheckoutSession } from "./provider";

let client: Stripe | null = null;
export function stripe(): Stripe {
  if (!env.stripeSecretKey) throw new Error("Stripe is not configured");
  client ??= new Stripe(env.stripeSecretKey);
  return client;
}

export async function createStripeCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
  const base = env.appUrl;
  const orderUrl = `${base}/orders/${req.orderId}?t=${encodeURIComponent(req.accessToken)}`;
  // Stripe requires expires_at >= 30 minutes; our reservation (35 min) outlives it.
  const expiresAt = Math.max(Math.floor(req.expiresAt.getTime() / 1000) - 4 * 60, Math.floor(Date.now() / 1000) + 30 * 60 + 5);
  const session = await stripe().checkout.sessions.create(
    {
      mode: "payment",
      client_reference_id: req.orderId,
      customer_email: req.buyerEmail,
      metadata: { orderId: req.orderId },
      payment_intent_data: { metadata: { orderId: req.orderId } },
      expires_at: expiresAt,
      line_items: req.lines.map((l) => ({
        quantity: l.quantity,
        price_data: {
          currency: req.currency.toLowerCase(),
          unit_amount: l.unitPriceCents,
          product_data: { name: `${req.eventTitle} — ${l.name}` },
        },
      })),
      success_url: orderUrl,
      cancel_url: `${base}/e/${req.eventSlug}?checkout=cancelled&order=${req.orderId}`,
    },
    // The same order can never create two Stripe sessions.
    { idempotencyKey: `checkout:${req.orderId}` },
  );
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { sessionId: session.id, url: session.url };
}

export async function refundStripePayment(paymentIntentId: string, orderId: string) {
  await stripe().refunds.create(
    { payment_intent: paymentIntentId, metadata: { orderId } },
    { idempotencyKey: `refund:${orderId}` },
  );
}

export async function expireStripeSession(sessionId: string) {
  try {
    await stripe().checkout.sessions.expire(sessionId);
  } catch {
    // Already completed/expired — the webhook is the source of truth.
  }
}

/** Throws if the signature is invalid. Requires the exact raw request body. */
export function verifyStripeWebhook(rawBody: string, signature: string | null): Stripe.Event {
  if (!env.stripeWebhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  if (!signature) throw new Error("Missing Stripe-Signature header");
  return stripe().webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret, 300);
}
