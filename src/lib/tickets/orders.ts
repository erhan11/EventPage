import "server-only";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db, type Tx } from "@/lib/db";
import { events, orderItems, orders, ticketTypes, tickets, type Order } from "@/lib/db/schema";
import { humanCode, randomToken, sha256 } from "@/lib/security/crypto";
import { CheckoutError } from "./errors";

/** How long a pending checkout holds inventory. Must outlive the provider session (Stripe min: 30 min). */
export const RESERVATION_MS = 35 * 60 * 1000;
export const MAX_TICKETS_PER_ORDER = 20;
/** Unpaid tickets one email may hold per event at a time. */
export const MAX_PENDING_PER_BUYER = 20;

export interface CheckoutLine {
  ticketTypeId: string;
  quantity: number;
}

export interface CreateOrderInput {
  eventId: string;
  lines: CheckoutLine[];
  buyerName: string;
  buyerEmail: string;
  /** Provider to use when the order total is > 0. */
  paidProvider: "stripe" | "test_simulator" | null;
  now?: Date;
}

export interface CreatedOrder {
  order: Order;
  /** Bearer token for the buyer's ticket page. Only returned once; we store its hash. */
  accessToken: string;
  lines: { ticketTypeId: string; name: string; quantity: number; unitPriceCents: number }[];
  event: { title: string; slug: string };
}

/**
 * Reserves inventory and creates a pending order in one transaction.
 *
 * Overselling is prevented three ways:
 *  1. The event row is locked (FOR UPDATE) so checkouts for one event serialize.
 *  2. Each reservation is a conditional UPDATE (sold + reserved + qty <= capacity).
 *  3. A CHECK constraint on ticket_types rejects any row that would exceed capacity.
 *
 * Free orders are fulfilled in the same transaction. Paid orders stay `pending`
 * until a verified payment webhook arrives — nothing here can mark them paid.
 */
export async function createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
  const now = input.now ?? new Date();
  const lines = mergeLines(input.lines);
  if (lines.length === 0) throw new CheckoutError("INVALID_SELECTION", "Select at least one ticket.");
  const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
  if (totalQty > MAX_TICKETS_PER_ORDER)
    throw new CheckoutError("LIMIT_EXCEEDED", `Maximum ${MAX_TICKETS_PER_ORDER} tickets per order.`);

  const accessToken = randomToken(32);

  return db.transaction(async (tx) => {
    const [event] = await tx.select().from(events).where(eq(events.id, input.eventId)).for("update");
    if (!event || event.status !== "published" || event.endsAt <= now)
      throw new CheckoutError("EVENT_UNAVAILABLE", "This event is not on sale.");

    const types = await tx
      .select()
      .from(ticketTypes)
      .where(and(eq(ticketTypes.eventId, event.id), inArray(ticketTypes.id, lines.map((l) => l.ticketTypeId))))
      .for("update");
    const byId = new Map(types.map((t) => [t.id, t]));

    const priced: CreatedOrder["lines"] = [];
    for (const line of lines) {
      const t = byId.get(line.ticketTypeId);
      if (!t || !t.isActive) throw new CheckoutError("INVALID_SELECTION", "That ticket is no longer available.");
      if ((t.salesStartAt && t.salesStartAt > now) || (t.salesEndAt && t.salesEndAt <= now))
        throw new CheckoutError("SALES_CLOSED", `Sales for ${t.name} are closed.`);
      if (line.quantity > t.maxPerOrder)
        throw new CheckoutError("LIMIT_EXCEEDED", `Maximum ${t.maxPerOrder} × ${t.name} per order.`);
      priced.push({ ticketTypeId: t.id, name: t.name, quantity: line.quantity, unitPriceCents: t.priceCents });
    }

    // Anti-hoarding: cap what one buyer can hold unpaid, and how many free tickets they can claim.
    // Consistent because the event row is locked for the rest of this transaction.
    const buyerEmail = input.buyerEmail.trim().toLowerCase();
    const mine = await tx
      .select({
        ticketTypeId: orderItems.ticketTypeId,
        pending: sql<number>`coalesce(sum(${orderItems.quantity}) filter (where ${orders.status} = 'pending'), 0)::int`,
        claimed: sql<number>`coalesce(sum(${orderItems.quantity}) filter (where ${orders.status} in ('pending','paid')), 0)::int`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(eq(orders.eventId, event.id), eq(orders.buyerEmail, buyerEmail)))
      .groupBy(orderItems.ticketTypeId);
    const pendingNow = mine.reduce((s, r) => s + r.pending, 0);
    if (pendingNow + totalQty > MAX_PENDING_PER_BUYER)
      throw new CheckoutError("LIMIT_EXCEEDED", "You already have tickets on hold — finish or wait for that checkout first.");
    for (const line of priced) {
      const t = byId.get(line.ticketTypeId)!;
      const claimed = mine.find((r) => r.ticketTypeId === t.id)?.claimed ?? 0;
      if (t.priceCents === 0 && claimed + line.quantity > t.maxPerOrder)
        throw new CheckoutError("LIMIT_EXCEEDED", `Limit of ${t.maxPerOrder} × ${t.name} per person.`);
    }

    if (event.capacity != null) {
      const [{ used }] = await tx
        .select({ used: sql<number>`coalesce(sum(${ticketTypes.sold} + ${ticketTypes.reserved}), 0)::int` })
        .from(ticketTypes)
        .where(eq(ticketTypes.eventId, event.id));
      if (used + totalQty > event.capacity) throw new CheckoutError("SOLD_OUT", "This event is at capacity.");
    }

    for (const line of priced) {
      const updated = await tx
        .update(ticketTypes)
        .set({ reserved: sql`${ticketTypes.reserved} + ${line.quantity}` })
        .where(
          and(
            eq(ticketTypes.id, line.ticketTypeId),
            sql`${ticketTypes.sold} + ${ticketTypes.reserved} + ${line.quantity} <= ${ticketTypes.capacity}`,
          ),
        )
        .returning({ id: ticketTypes.id });
      if (updated.length === 0) throw new CheckoutError("SOLD_OUT", `${line.name} is sold out.`);
    }

    const total = priced.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0);
    const provider = total === 0 ? "free" : input.paidProvider;
    if (!provider) throw new CheckoutError("PAYMENTS_UNAVAILABLE", "Card payments are not available right now.");

    const [order] = await tx
      .insert(orders)
      .values({
        eventId: event.id,
        orgId: event.orgId,
        status: "pending",
        provider,
        buyerName: input.buyerName.trim(),
        buyerEmail: input.buyerEmail.trim().toLowerCase(),
        totalCents: total,
        currency: event.currency,
        accessTokenHash: sha256(accessToken),
        expiresAt: new Date(now.getTime() + RESERVATION_MS),
      })
      .returning();

    await tx.insert(orderItems).values(
      priced.map((l) => ({
        orderId: order.id,
        ticketTypeId: l.ticketTypeId,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
      })),
    );

    if (total === 0) {
      await fulfillInTx(tx, order.id, { amountCents: 0, currency: event.currency, paymentId: null }, now);
      const [paid] = await tx.select().from(orders).where(eq(orders.id, order.id));
      return { order: paid, accessToken, lines: priced, event: { title: event.title, slug: event.slug } };
    }
    return { order, accessToken, lines: priced, event: { title: event.title, slug: event.slug } };
  });
}

function mergeLines(lines: CheckoutLine[]): CheckoutLine[] {
  const m = new Map<string, number>();
  for (const l of lines) {
    if (!Number.isInteger(l.quantity) || l.quantity < 0 || l.quantity > MAX_TICKETS_PER_ORDER)
      throw new CheckoutError("INVALID_SELECTION", "Invalid quantity.");
    if (l.quantity === 0) continue;
    m.set(l.ticketTypeId, (m.get(l.ticketTypeId) ?? 0) + l.quantity);
  }
  return [...m].map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));
}

export async function attachProviderSession(orderId: string, providerSessionId: string) {
  await db
    .update(orders)
    .set({ providerSessionId })
    .where(and(eq(orders.id, orderId), eq(orders.status, "pending")));
}

export interface VerifiedPayment {
  /** Amount the provider says was captured, in minor units. */
  amountCents: number;
  currency: string;
  paymentId: string | null;
}

export type FulfillResult =
  | { status: "fulfilled"; ticketCount: number }
  | { status: "already_fulfilled" }
  | { status: "needs_refund"; reason: string }
  | { status: "ignored"; reason: string };

/**
 * Turns a verified payment into tickets. Must only be called from a signature-verified
 * webhook handler (or for free orders). Safe to call any number of times.
 */
export async function fulfillOrder(orderId: string, payment: VerifiedPayment, now = new Date()) {
  return db.transaction((tx) => fulfillInTx(tx, orderId, payment, now));
}

async function fulfillInTx(tx: Tx, orderId: string, payment: VerifiedPayment, now: Date): Promise<FulfillResult> {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
  if (!order) return { status: "ignored", reason: "unknown order" };
  if (order.status === "paid") return { status: "already_fulfilled" };
  if (order.status === "refund_pending" || order.status === "refunded")
    return { status: "ignored", reason: `order is ${order.status}` };

  if (payment.amountCents !== order.totalCents || payment.currency.toUpperCase() !== order.currency.toUpperCase()) {
    // Never issue tickets for a mismatched amount — flag for refund instead.
    await markRefundPending(tx, order, payment.paymentId);
    return { status: "needs_refund", reason: "amount mismatch" };
  }

  // Lock the event (same order as checkout: event → ticket types) and refuse cancelled/finished events.
  const [event] = await tx.select().from(events).where(eq(events.id, order.eventId)).for("update");
  if (!event || event.status === "cancelled" || event.endsAt <= now) {
    await markRefundPending(tx, order, payment.paymentId);
    return { status: "needs_refund", reason: "event no longer running" };
  }

  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));

  if (order.status !== "pending" && event.capacity != null) {
    // Late payment: the hold was released, so event-wide capacity must be re-checked too.
    const qty = items.reduce((s, it) => s + it.quantity, 0);
    const [{ used }] = await tx
      .select({ used: sql<number>`coalesce(sum(${ticketTypes.sold} + ${ticketTypes.reserved}), 0)::int` })
      .from(ticketTypes)
      .where(eq(ticketTypes.eventId, event.id));
    if (used + qty > event.capacity) throw new LateInventoryError();
  }

  if (order.status === "pending") {
    for (const it of items) {
      await tx
        .update(ticketTypes)
        .set({
          reserved: sql`${ticketTypes.reserved} - ${it.quantity}`,
          sold: sql`${ticketTypes.sold} + ${it.quantity}`,
        })
        .where(eq(ticketTypes.id, it.ticketTypeId));
    }
  } else {
    // Payment arrived after the reservation was released (expired/cancelled).
    // Re-acquire inventory if it is still there; otherwise refund.
    for (const it of items) {
      const ok = await tx
        .update(ticketTypes)
        .set({ sold: sql`${ticketTypes.sold} + ${it.quantity}` })
        .where(
          and(
            eq(ticketTypes.id, it.ticketTypeId),
            sql`${ticketTypes.sold} + ${ticketTypes.reserved} + ${it.quantity} <= ${ticketTypes.capacity}`,
          ),
        )
        .returning({ id: ticketTypes.id });
      // Throwing rolls back any partial re-acquisition; fulfillOrderOrFlag handles the refund.
      if (ok.length === 0) throw new LateInventoryError();
    }
  }

  let count = 0;
  for (const it of items) {
    const rows = Array.from({ length: it.quantity }, (_, i) => ({
      orderId: order.id,
      orderItemId: it.id,
      seq: i + 1,
      eventId: order.eventId,
      ticketTypeId: it.ticketTypeId,
      code: humanCode(8),
    }));
    const inserted = await tx
      .insert(tickets)
      .values(rows)
      .onConflictDoNothing({ target: [tickets.orderItemId, tickets.seq] })
      .returning({ id: tickets.id });
    count += inserted.length;
  }

  await tx
    .update(orders)
    .set({ status: "paid", paidAt: now, providerPaymentId: payment.paymentId ?? order.providerPaymentId })
    .where(eq(orders.id, order.id));

  return { status: "fulfilled", ticketCount: count };
}

class LateInventoryError extends Error {}

/**
 * Wrapper used by webhook handlers: a late payment for an order whose inventory is gone
 * becomes `refund_pending` (in its own transaction, after the failed one rolled back).
 */
export async function fulfillOrderOrFlag(orderId: string, payment: VerifiedPayment): Promise<FulfillResult> {
  try {
    return await fulfillOrder(orderId, payment);
  } catch (e) {
    if (!(e instanceof LateInventoryError)) throw e;
    await db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
      if (order && order.status !== "paid") await markRefundPending(tx, order, payment.paymentId);
    });
    return { status: "needs_refund", reason: "inventory no longer available" };
  }
}

async function markRefundPending(tx: Tx, order: Order, paymentId: string | null) {
  if (order.status === "pending") await releaseReservation(tx, order.id);
  await tx
    .update(orders)
    .set({ status: "refund_pending", providerPaymentId: paymentId ?? order.providerPaymentId })
    .where(eq(orders.id, order.id));
}

async function releaseReservation(tx: Tx, orderId: string) {
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  for (const it of items) {
    await tx
      .update(ticketTypes)
      .set({ reserved: sql`${ticketTypes.reserved} - ${it.quantity}` })
      .where(eq(ticketTypes.id, it.ticketTypeId));
  }
}

/** Ends a pending order and releases its inventory. No-op for any other status. */
export async function closePendingOrder(orderId: string, to: "expired" | "cancelled"): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order || order.status !== "pending") return false;
    await releaseReservation(tx, order.id);
    await tx.update(orders).set({ status: to }).where(eq(orders.id, order.id));
    return true;
  });
}

/** Releases abandoned checkouts. Called opportunistically and from the cron endpoint. */
export async function expireStaleOrders(now = new Date(), limit = 200): Promise<number> {
  const stale = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.status, "pending"), lt(orders.expiresAt, now)))
    .limit(limit);
  let n = 0;
  for (const { id } of stale) if (await closePendingOrder(id, "expired")) n++;
  return n;
}

/**
 * Organizer-initiated refund. Voids every ticket that hasn't been used and returns
 * that inventory to sale. Paid orders move to `refund_pending` until the provider
 * confirms; free orders are refunded immediately.
 */
export async function beginRefund(orderId: string): Promise<{ order: Order; voided: number } | null> {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order || order.status !== "paid") return null;

    const voided = await tx
      .update(tickets)
      .set({ status: "void", voidReason: "refunded" })
      .where(and(eq(tickets.orderId, order.id), eq(tickets.status, "valid")))
      .returning({ ticketTypeId: tickets.ticketTypeId });

    const perType = new Map<string, number>();
    for (const v of voided) perType.set(v.ticketTypeId, (perType.get(v.ticketTypeId) ?? 0) + 1);
    for (const [id, q] of perType) {
      await tx
        .update(ticketTypes)
        .set({ sold: sql`${ticketTypes.sold} - ${q}` })
        .where(eq(ticketTypes.id, id));
    }

    const status = order.provider === "free" ? "refunded" : "refund_pending";
    const [updated] = await tx
      .update(orders)
      .set({ status, refundedAt: status === "refunded" ? new Date() : null })
      .where(eq(orders.id, order.id))
      .returning();
    return { order: updated, voided: voided.length };
  });
}

/** Provider confirmed the refund (from a verified webhook). */
export async function confirmRefund(orderId: string) {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order) return false;
    if (order.status === "refunded") return true;
    if (order.status === "paid") {
      // Refund issued from the provider dashboard — void tickets here too.
      const voided = await tx
        .update(tickets)
        .set({ status: "void", voidReason: "refunded" })
        .where(and(eq(tickets.orderId, order.id), eq(tickets.status, "valid")))
        .returning({ ticketTypeId: tickets.ticketTypeId });
      const perType = new Map<string, number>();
      for (const t of voided) perType.set(t.ticketTypeId, (perType.get(t.ticketTypeId) ?? 0) + 1);
      for (const [id, q] of perType)
        await tx.update(ticketTypes).set({ sold: sql`${ticketTypes.sold} - ${q}` }).where(eq(ticketTypes.id, id));
    } else if (order.status !== "refund_pending") {
      return false;
    }
    await tx.update(orders).set({ status: "refunded", refundedAt: new Date() }).where(eq(orders.id, order.id));
    return true;
  });
}

export async function findOrderByAccessToken(orderId: string, token: string) {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.accessTokenHash, sha256(token))))
    .limit(1);
  return order ?? null;
}
