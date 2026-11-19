"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { sendTicketsEmail } from "@/lib/tickets/notify";
import { z } from "zod";
import { env } from "@/lib/env";
import { activePaidProvider } from "@/lib/payments/provider";
import { createStripeCheckout } from "@/lib/payments/stripe";
import { clientIp, limitByIp, rateLimit } from "@/lib/security/rate-limit";
import { CheckoutError } from "@/lib/tickets/errors";
import { attachProviderSession, closePendingOrder, createOrder, expireStaleOrders } from "@/lib/tickets/orders";

export type CheckoutState = { error: string } | null;

const schema = z.object({
  eventId: z.uuid(),
  slug: z.string().max(64),
  name: z.string().trim().min(2, "Please enter your name.").max(80),
  email: z.email("Please enter a valid email.").max(120),
  lines: z
    .array(z.object({ ticketTypeId: z.uuid(), quantity: z.number().int().min(1).max(20) }))
    .min(1, "Select at least one ticket.")
    .max(10),
});

export async function startCheckout(_prev: CheckoutState, form: FormData): Promise<CheckoutState> {
  const limit = await limitByIp("checkout", 12, 60_000);
  if (!limit.ok) return { error: `Too many attempts. Try again in ${limit.retryAfterSec}s.` };

  let lines: unknown;
  try {
    lines = JSON.parse(String(form.get("lines") ?? "[]"));
  } catch {
    return { error: "Invalid selection." };
  }
  const parsed = schema.safeParse({
    eventId: form.get("eventId"),
    slug: form.get("slug"),
    name: form.get("name"),
    email: form.get("email"),
    lines,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const input = parsed.data;

  // Budget of tickets one network can put on hold per event per hour (anti-hoarding).
  const qty = input.lines.reduce((s, l) => s + l.quantity, 0);
  const budget = rateLimit(`checkout-qty:${await clientIp()}:${input.eventId}`, 60, 60 * 60_000, qty);
  if (!budget.ok) return { error: "Too many tickets requested from this network. Try again later." };

  // Return abandoned holds to sale before reserving.
  await expireStaleOrders(new Date(), 50);

  const provider = activePaidProvider();
  let created;
  try {
    created = await createOrder({
      eventId: input.eventId,
      lines: input.lines,
      buyerName: input.name,
      buyerEmail: input.email,
      paidProvider: provider,
    });
  } catch (e) {
    if (e instanceof CheckoutError) return { error: e.message };
    console.error("checkout failed", e);
    return { error: "Something went wrong. You have not been charged." };
  }

  const { order, accessToken } = created;
  const ticketsUrl = `/orders/${order.id}?t=${encodeURIComponent(accessToken)}`;
  if (order.status === "paid") {
    after(() => sendTicketsEmail(order.id).catch((e) => console.error("[email] tickets email failed", e)));
    redirect(ticketsUrl);
  }

  let checkoutUrl: string;
  try {
    if (order.provider === "stripe") {
      const session = await createStripeCheckout({
        orderId: order.id,
        accessToken,
        eventTitle: created.event.title,
        eventSlug: created.event.slug,
        currency: order.currency,
        buyerEmail: order.buyerEmail,
        lines: created.lines,
        expiresAt: order.expiresAt,
      });
      await attachProviderSession(order.id, session.sessionId);
      checkoutUrl = session.url;
    } else if (order.provider === "test_simulator") {
      await attachProviderSession(order.id, `sim_${order.id}`);
      checkoutUrl = `${env.appUrl}/test-gateway/${order.id}?t=${encodeURIComponent(accessToken)}`;
    } else {
      throw new Error(`Unexpected provider ${order.provider}`);
    }
  } catch (e) {
    console.error("payment session failed", e);
    await closePendingOrder(order.id, "cancelled");
    return { error: "Payment provider unavailable. You have not been charged — please try again." };
  }
  redirect(checkoutUrl);
}
