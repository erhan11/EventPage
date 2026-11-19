import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { verifyStripeWebhook } from "@/lib/payments/stripe";
import { handleVerifiedPayment, onceWebhook } from "@/lib/payments/webhooks";
import { closePendingOrder, confirmRefund } from "@/lib/tickets/orders";

/**
 * Stripe webhook. Configure in the Stripe dashboard (or `stripe listen --forward-to
 * localhost:3000/api/webhooks/stripe`) with events:
 *   checkout.session.completed, checkout.session.async_payment_succeeded,
 *   checkout.session.async_payment_failed, checkout.session.expired, charge.refunded
 */
export async function POST(req: Request) {
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = verifyStripeWebhook(raw, req.headers.get("stripe-signature"));
  } catch (e) {
    console.warn("[stripe] rejected webhook:", (e as Error).message);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    await onceWebhook("stripe", event.id, event.type, async () => {
      switch (event.type) {
        case "checkout.session.completed":
        case "checkout.session.async_payment_succeeded": {
          const s = event.data.object as Stripe.Checkout.Session;
          // For delayed methods, `completed` arrives with payment_status 'unpaid' — wait for async_payment_succeeded.
          if (s.payment_status !== "paid") return;
          const orderId = s.metadata?.orderId ?? s.client_reference_id;
          if (!orderId) return;
          await handleVerifiedPayment("stripe", orderId, {
            amountCents: s.amount_total ?? -1,
            currency: s.currency ?? "",
            paymentId: typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? null),
          }, s.id);
          return;
        }
        case "checkout.session.expired":
        case "checkout.session.async_payment_failed": {
          const s = event.data.object as Stripe.Checkout.Session;
          const orderId = s.metadata?.orderId ?? s.client_reference_id;
          if (orderId) await closePendingOrder(orderId, event.type === "checkout.session.expired" ? "expired" : "cancelled");
          return;
        }
        case "charge.refunded": {
          const c = event.data.object as Stripe.Charge;
          if (!c.refunded) return; // partial refunds are not modelled yet
          const pi = typeof c.payment_intent === "string" ? c.payment_intent : c.payment_intent?.id;
          if (!pi) return;
          const [order] = await db.select({ id: orders.id }).from(orders).where(eq(orders.providerPaymentId, pi)).limit(1);
          if (order) await confirmRefund(order.id);
          return;
        }
      }
    });
  } catch (e) {
    console.error("[stripe] webhook handler failed", e);
    // 500 → Stripe retries with backoff; handlers are idempotent.
    return new Response("Handler error", { status: 500 });
  }
  return Response.json({ received: true });
}
