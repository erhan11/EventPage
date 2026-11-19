import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, webhookEvents } from "@/lib/db/schema";
import { confirmRefund, fulfillOrderOrFlag, type VerifiedPayment } from "@/lib/tickets/orders";
import { refundStripePayment } from "./stripe";

type Provider = "stripe" | "test_simulator";

/**
 * Runs `handler` at most once per provider event id. Handlers are themselves idempotent,
 * so the record is written *after* success — a crash mid-way lets the provider retry.
 */
export async function onceWebhook(provider: Provider, id: string, type: string, handler: () => Promise<void>) {
  const [seen] = await db.select({ id: webhookEvents.id }).from(webhookEvents).where(eq(webhookEvents.id, `${provider}:${id}`)).limit(1);
  if (seen) return "duplicate" as const;
  await handler();
  await db.insert(webhookEvents).values({ id: `${provider}:${id}`, provider, type }).onConflictDoNothing();
  return "processed" as const;
}

export async function handleVerifiedPayment(provider: Provider, orderId: string, payment: VerifiedPayment, sessionId?: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order || order.provider !== provider || (sessionId && order.providerSessionId !== sessionId)) {
    console.warn(`[webhook] payment for unknown/mismatched order ${orderId}`);
    return;
  }
  const result = await fulfillOrderOrFlag(orderId, payment);
  if (result.status === "needs_refund") {
    console.warn(`[webhook] order ${orderId} needs refund: ${result.reason}`);
    if (provider === "stripe" && payment.paymentId) await refundStripePayment(payment.paymentId, orderId);
    if (provider === "test_simulator") await confirmRefund(orderId);
  }
}
