import "server-only";
import { env } from "@/lib/env";

export type PaidProviderId = "stripe" | "test_simulator";

/**
 * Which provider handles paid orders:
 *  - Stripe whenever STRIPE_SECRET_KEY is configured (use sk_test_… keys until go-live).
 *  - The local test simulator only outside production, when Stripe is not configured.
 *  - Otherwise none: paid tickets can't be bought (free tickets still work).
 */
export function activePaidProvider(): PaidProviderId | null {
  if (env.stripeSecretKey) return "stripe";
  if (!env.isProduction && env.devPaymentWebhookSecret) return "test_simulator";
  return null;
}

export function isTestMode(): boolean {
  const p = activePaidProvider();
  return p === "test_simulator" || (p === "stripe" && env.stripeSecretKey!.startsWith("sk_test_"));
}

export interface CheckoutLineItem {
  name: string;
  quantity: number;
  unitPriceCents: number;
}

export interface CheckoutRequest {
  orderId: string;
  accessToken: string;
  eventTitle: string;
  eventSlug: string;
  currency: string;
  buyerEmail: string;
  lines: CheckoutLineItem[];
  expiresAt: Date;
}

export interface CheckoutSession {
  sessionId: string;
  url: string;
}
