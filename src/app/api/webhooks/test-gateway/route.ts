import { env } from "@/lib/env";
import { activePaidProvider } from "@/lib/payments/provider";
import { SIM_SIGNATURE_HEADER, verifySimulatorPayload } from "@/lib/payments/simulator";
import { handleVerifiedPayment, onceWebhook } from "@/lib/payments/webhooks";
import { closePendingOrder, confirmRefund } from "@/lib/tickets/orders";

/** Webhook receiver for the local test gateway. Hard-disabled in production. */
export async function POST(req: Request) {
  if (env.isProduction || activePaidProvider() !== "test_simulator" || !env.devPaymentWebhookSecret) {
    return new Response("Not found", { status: 404 });
  }
  const raw = await req.text();
  let evt;
  try {
    evt = verifySimulatorPayload(raw, req.headers.get(SIM_SIGNATURE_HEADER), env.devPaymentWebhookSecret);
  } catch (e) {
    console.warn("[test-gateway] rejected webhook:", (e as Error).message);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    await onceWebhook("test_simulator", evt.id, evt.type, async () => {
      if (evt.type === "payment.succeeded") {
        await handleVerifiedPayment("test_simulator", evt.orderId, {
          amountCents: evt.amountCents,
          currency: evt.currency,
          paymentId: evt.paymentId,
        });
      } else if (evt.type === "payment.failed") {
        await closePendingOrder(evt.orderId, "cancelled");
      } else if (evt.type === "refund.succeeded") {
        await confirmRefund(evt.orderId);
      }
    });
  } catch (e) {
    console.error("[test-gateway] handler failed", e);
    return new Response("Handler error", { status: 500 });
  }
  return Response.json({ received: true });
}
