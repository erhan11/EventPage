"use server";

import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { activePaidProvider } from "@/lib/payments/provider";
import { SIM_SIGNATURE_HEADER, signSimulatorPayload, type SimulatorEvent } from "@/lib/payments/simulator";
import { randomToken } from "@/lib/security/crypto";
import { findOrderByAccessToken } from "@/lib/tickets/orders";

export async function simulateGateway(form: FormData) {
  if (env.isProduction || activePaidProvider() !== "test_simulator" || !env.devPaymentWebhookSecret) {
    throw new Error("Test gateway disabled");
  }
  const orderId = String(form.get("orderId"));
  const token = String(form.get("t"));
  if (!/^[0-9a-f-]{36}$/i.test(orderId) || token.length > 64) throw new Error("Invalid order");
  const outcome = form.get("outcome") === "decline" ? "decline" : "pay";
  const order = await findOrderByAccessToken(orderId, token);
  if (!order || order.status !== "pending") redirect(`/orders/${orderId}?t=${encodeURIComponent(token)}`);

  const evt: SimulatorEvent = {
    id: `evt_sim_${randomToken(12)}`,
    type: outcome === "pay" ? "payment.succeeded" : "payment.failed",
    orderId: order.id,
    amountCents: order.totalCents,
    currency: order.currency,
    paymentId: `pay_sim_${randomToken(12)}`,
  };
  const body = JSON.stringify(evt);

  // Deliver the webhook over HTTP, exactly like an external provider would.
  const res = await fetch(`${env.appUrl}/api/webhooks/test-gateway`, {
    method: "POST",
    headers: { "content-type": "application/json", [SIM_SIGNATURE_HEADER]: signSimulatorPayload(body, env.devPaymentWebhookSecret) },
    body,
    cache: "no-store",
  });
  if (!res.ok) console.error("[test-gateway] webhook delivery failed", res.status);

  redirect(`/orders/${order.id}?t=${encodeURIComponent(token)}`);
}
