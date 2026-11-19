import { hmac, safeEqual } from "@/lib/security/crypto";

/**
 * Local test-mode payment gateway.
 *
 * Mirrors a real provider: a hosted "pay" page and a separately delivered, HMAC-signed
 * webhook. Tickets are only issued when the webhook endpoint verifies the signature —
 * exactly the same path a real provider takes. Disabled in production and whenever
 * Stripe is configured (see activePaidProvider).
 */

export const SIM_SIGNATURE_HEADER = "x-eventpage-sim-signature";
const TOLERANCE_SEC = 300;

export interface SimulatorEvent {
  id: string;
  type: "payment.succeeded" | "payment.failed" | "refund.succeeded";
  orderId: string;
  amountCents: number;
  currency: string;
  paymentId: string;
}

export function signSimulatorPayload(body: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const sig = hmac(secret, `${timestamp}.${body}`).toString("hex");
  return `t=${timestamp},v1=${sig}`;
}

export function verifySimulatorPayload(
  body: string,
  header: string | null,
  secret: string,
  now = Math.floor(Date.now() / 1000),
): SimulatorEvent {
  if (!header) throw new Error("Missing signature");
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(now - t) > TOLERANCE_SEC) throw new Error("Signature timestamp out of tolerance");
  const expected = hmac(secret, `${t}.${body}`).toString("hex");
  if (!parts.v1 || !safeEqual(parts.v1, expected)) throw new Error("Invalid signature");
  const evt = JSON.parse(body) as SimulatorEvent;
  if (typeof evt.id !== "string" || typeof evt.orderId !== "string") throw new Error("Malformed event");
  return evt;
}
