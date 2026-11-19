import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { checkins, events, eventStaff, orderItems, orders, tickets, ticketTypes, users } from "@/lib/db/schema";

/** Net revenue counts paid orders only; refunds drop out automatically by status. */
export async function orgEventSummaries(orgId: string) {
  const evs = await db.select().from(events).where(eq(events.orgId, orgId)).orderBy(desc(events.startsAt));
  if (evs.length === 0) return [];
  const ids = evs.map((e) => e.id);
  const inv = await db
    .select({
      eventId: ticketTypes.eventId,
      sold: sql<number>`sum(${ticketTypes.sold})::int`,
      capacity: sql<number>`sum(${ticketTypes.capacity})::int`,
    })
    .from(ticketTypes)
    .where(inArray(ticketTypes.eventId, ids))
    .groupBy(ticketTypes.eventId);
  const rev = await db
    .select({ eventId: orders.eventId, revenue: sql<number>`coalesce(sum(${orders.totalCents}),0)::int` })
    .from(orders)
    .where(and(inArray(orders.eventId, ids), eq(orders.status, "paid")))
    .groupBy(orders.eventId);
  const invBy = new Map(inv.map((r) => [r.eventId, r]));
  const revBy = new Map(rev.map((r) => [r.eventId, r.revenue]));
  return evs.map((e) => ({
    event: e,
    sold: invBy.get(e.id)?.sold ?? 0,
    capacity: e.capacity ?? invBy.get(e.id)?.capacity ?? 0,
    revenue: revBy.get(e.id) ?? 0,
  }));
}

export async function eventMetrics(eventId: string) {
  const types = await db.select().from(ticketTypes).where(eq(ticketTypes.eventId, eventId)).orderBy(asc(ticketTypes.sort));

  const perType = await db
    .select({
      ticketTypeId: orderItems.ticketTypeId,
      revenue: sql<number>`coalesce(sum(${orderItems.quantity} * ${orderItems.unitPriceCents}),0)::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orders.eventId, eventId), eq(orders.status, "paid")))
    .groupBy(orderItems.ticketTypeId);
  const revByType = new Map(perType.map((r) => [r.ticketTypeId, r.revenue]));

  const [ord] = await db
    .select({
      paid: sql<number>`count(*) filter (where ${orders.status} = 'paid')::int`,
      pending: sql<number>`count(*) filter (where ${orders.status} = 'pending')::int`,
      refunded: sql<number>`count(*) filter (where ${orders.status} in ('refunded','refund_pending'))::int`,
      revenue: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.status} = 'paid'),0)::int`,
    })
    .from(orders)
    .where(eq(orders.eventId, eventId));

  const [tix] = await db
    .select({
      issued: sql<number>`count(*) filter (where ${tickets.status} <> 'void')::int`,
      checkedIn: sql<number>`count(*) filter (where ${tickets.status} = 'checked_in')::int`,
    })
    .from(tickets)
    .where(eq(tickets.eventId, eventId));

  const since = new Date(Date.now() - 13 * 864e5);
  since.setUTCHours(0, 0, 0, 0);
  const daily = await db
    .select({
      day: sql<string>`to_char(${orders.paidAt} at time zone 'UTC', 'YYYY-MM-DD')`,
      tickets: sql<number>`coalesce(sum(${orderItems.quantity}),0)::int`,
    })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(and(eq(orders.eventId, eventId), eq(orders.status, "paid"), gte(orders.paidAt, since)))
    .groupBy(sql`1`);
  const dailyMap = new Map(daily.map((d) => [d.day, d.tickets]));
  const series = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(since.getTime() + i * 864e5).toISOString().slice(0, 10);
    return { day: d, tickets: dailyMap.get(d) ?? 0 };
  });

  return {
    types: types.map((t) => ({ ...t, revenue: revByType.get(t.id) ?? 0 })),
    orders: ord,
    tickets: tix,
    series,
  };
}

export async function eventOrders(eventId: string, q: string, limit = 100) {
  const term = q.trim().slice(0, 80);
  const where = term
    ? and(eq(orders.eventId, eventId), or(ilike(orders.buyerName, `%${term}%`), ilike(orders.buyerEmail, `%${term}%`)))
    : eq(orders.eventId, eventId);
  const rows = await db
    .select({
      order: orders,
      // Correlated subqueries must reference the outer row explicitly ("orders"."id").
      tickets: sql<number>`(select count(*)::int from tickets t where t.order_id = "orders"."id" and t.status <> 'void')`,
      checkedIn: sql<number>`(select count(*)::int from tickets t where t.order_id = "orders"."id" and t.status = 'checked_in')`,
      quantity: sql<number>`(select coalesce(sum(oi.quantity),0)::int from order_items oi where oi.order_id = "orders"."id")`,
    })
    .from(orders)
    .where(where)
    .orderBy(desc(orders.createdAt))
    .limit(limit);
  return rows;
}

export async function eventStaffList(eventId: string) {
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(eventStaff)
    .innerJoin(users, eq(users.id, eventStaff.userId))
    .where(eq(eventStaff.eventId, eventId));
}

export async function recentCheckins(eventId: string, limit = 8) {
  return db
    .select({ result: checkins.result, at: checkins.createdAt, staff: users.name, code: tickets.code })
    .from(checkins)
    .leftJoin(users, eq(users.id, checkins.staffUserId))
    .leftJoin(tickets, eq(tickets.id, checkins.ticketId))
    .where(eq(checkins.eventId, eventId))
    .orderBy(desc(checkins.createdAt))
    .limit(limit);
}
