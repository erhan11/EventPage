import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { events, orders, tickets, ticketTypes } from "@/lib/db/schema";
import { emailEnabled, sendEmail } from "@/lib/email";
import { ticketsEmail } from "@/lib/email/templates";
import { env } from "@/lib/env";
import { fmt } from "@/lib/format";
import { randomToken, sha256 } from "@/lib/security/crypto";

/**
 * Emails the buyer their tickets once per paid order. The claim (tickets_emailed_at)
 * is a conditional update, so concurrent webhook deliveries send a single email.
 */
export async function sendTicketsEmail(orderId: string) {
  if (!emailEnabled()) return;
  const token = randomToken(32);
  const claimed = await db
    .update(orders)
    .set({ ticketsEmailedAt: new Date(), emailAccessHash: sha256(token) })
    .where(and(eq(orders.id, orderId), eq(orders.status, "paid"), isNull(orders.ticketsEmailedAt)))
    .returning();
  const order = claimed[0];
  if (!order) return;

  const [event] = await db.select().from(events).where(eq(events.id, order.eventId));
  const rows = await db
    .select({ code: tickets.code, type: ticketTypes.name })
    .from(tickets)
    .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
    .where(eq(tickets.orderId, order.id))
    .orderBy(asc(tickets.createdAt), asc(tickets.seq));

  const mail = ticketsEmail({
    eventTitle: event.title,
    when: `${fmt.weekday(event.startsAt, event.timezone)} ${fmt.date(event.startsAt, event.timezone)} · ${fmt.time(event.startsAt, event.timezone)}`,
    venue: [event.venueName, event.city].filter(Boolean).join(", "),
    buyerName: order.buyerName,
    url: `${env.appUrl}/orders/${order.id}?t=${encodeURIComponent(token)}`,
    codes: rows,
    accent: event.design.accent,
  });
  const r = await sendEmail({ to: order.buyerEmail, ...mail, idempotencyKey: `tickets:${order.id}` });
  if (!r.sent) {
    // Release the claim so a later retry (e.g. webhook redelivery) can try again.
    await db.update(orders).set({ ticketsEmailedAt: null, emailAccessHash: null }).where(eq(orders.id, order.id));
  }
}
