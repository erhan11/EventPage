import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { events, orders, tickets, ticketTypes } from "@/lib/db/schema";
import { ipFromHeaders } from "@/lib/security/rate-limit";
import { safeNextPath } from "@/lib/security/redirect";
import { createTicketToken } from "@/lib/security/ticket-token";
import { scanTicket } from "@/lib/tickets/checkin";
import { closePendingOrder, createOrder, fulfillOrder, fulfillOrderOrFlag } from "@/lib/tickets/orders";
import { makeEvent, makeOrg, makeTicketType, resetDb } from "./helpers";

const SECRET = process.env.TICKET_SIGNING_SECRET!;
beforeEach(resetDb);

describe("anti-hoarding", () => {
  it("caps unpaid tickets one buyer can hold per event", async () => {
    const { org } = await makeOrg();
    const ev = await makeEvent(org.id);
    const tt = await makeTicketType(ev.id, { capacity: 500, maxPerOrder: 20 });
    const order = (q: number) =>
      createOrder({ eventId: ev.id, lines: [{ ticketTypeId: tt.id, quantity: q }], paidProvider: "test_simulator", buyerName: "Hoarder", buyerEmail: "Hoard@example.com" });
    await order(20);
    await expect(order(1)).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
  });

  it("limits free tickets per person across orders", async () => {
    const { org } = await makeOrg();
    const ev = await makeEvent(org.id);
    const tt = await makeTicketType(ev.id, { priceCents: 0, capacity: 100, maxPerOrder: 2 });
    const order = (q: number) =>
      createOrder({ eventId: ev.id, lines: [{ ticketTypeId: tt.id, quantity: q }], paidProvider: null, buyerName: "Free Loader", buyerEmail: "free@example.com" });
    await order(2);
    await expect(order(1)).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
  });
});

describe("late payments and cancelled events", () => {
  it("re-checks event-wide capacity before honouring a late payment", async () => {
    const { org } = await makeOrg();
    const ev = await makeEvent(org.id, { capacity: 2 });
    const a = await makeTicketType(ev.id, { priceCents: 1000, capacity: 10 });
    const late = await createOrder({ eventId: ev.id, lines: [{ ticketTypeId: a.id, quantity: 1 }], paidProvider: "test_simulator", buyerName: "Late Larry", buyerEmail: "late@example.com" });
    await closePendingOrder(late.order.id, "expired");
    const other = await createOrder({ eventId: ev.id, lines: [{ ticketTypeId: a.id, quantity: 2 }], paidProvider: "test_simulator", buyerName: "Prompt Pat", buyerEmail: "pat@example.com" });
    await fulfillOrder(other.order.id, { amountCents: 2000, currency: "EUR", paymentId: "pi_ok" });

    const r = await fulfillOrderOrFlag(late.order.id, { amountCents: 1000, currency: "EUR", paymentId: "pi_late" });
    expect(r.status).toBe("needs_refund");
    expect(await db.select().from(tickets).where(eq(tickets.orderId, late.order.id))).toHaveLength(0);
    const [t] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, a.id));
    expect(t.sold).toBe(2);
  });

  it("refunds instead of issuing tickets when the event was cancelled", async () => {
    const { org } = await makeOrg();
    const ev = await makeEvent(org.id);
    const tt = await makeTicketType(ev.id, { priceCents: 1000 });
    const { order } = await createOrder({ eventId: ev.id, lines: [{ ticketTypeId: tt.id, quantity: 1 }], paidProvider: "test_simulator", buyerName: "Ann Bee", buyerEmail: "ann@example.com" });
    await db.update(events).set({ status: "cancelled" }).where(eq(events.id, ev.id));
    const r = await fulfillOrderOrFlag(order.id, { amountCents: 1000, currency: "EUR", paymentId: "pi_c" });
    expect(r.status).toBe("needs_refund");
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(o.status).toBe("refund_pending");
    const [t] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, tt.id));
    expect([t.sold, t.reserved]).toEqual([0, 0]);
  });

  it("admits no one at a cancelled event", async () => {
    const { org, user } = await makeOrg();
    const ev = await makeEvent(org.id);
    const tt = await makeTicketType(ev.id, { priceCents: 0 });
    const { order } = await createOrder({ eventId: ev.id, lines: [{ ticketTypeId: tt.id, quantity: 1 }], paidProvider: null, buyerName: "Ann Bee", buyerEmail: "ann@example.com" });
    const [ticket] = await db.select().from(tickets).where(eq(tickets.orderId, order.id));
    await db.update(events).set({ status: "cancelled" }).where(eq(events.id, ev.id));
    const r = await scanTicket({ input: createTicketToken(ticket.id, SECRET), eventId: ev.id, staffUserId: user.id, signingSecret: SECRET });
    expect(r.outcome).toBe("void");
    const [after] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    expect(after.status).toBe("valid");
  });
});

describe("redirects", () => {
  it("allows only in-app paths", () => {
    expect(safeNextPath("/dashboard/events/x", "/d")).toBe("/dashboard/events/x");
    expect(safeNextPath("/scan?x=1", "/d")).toBe("/scan?x=1");
    for (const bad of ["//evil.com", "/\t/evil.com", "/\\evil.com", "https://evil.com", "/e/whatever", "/dashboardx", "", null, "/scan\n"])
      expect(safeNextPath(bad, "/d")).toBe("/d");
  });
});

describe("client IP trust", () => {
  it("ignores client-supplied forwarding headers unless configured", () => {
    const h = new Headers({ "x-real-ip": "1.2.3.4", "x-forwarded-for": "5.6.7.8" });
    const prev = { t: process.env.TRUSTED_IP_HEADER, v: process.env.VERCEL };
    delete process.env.TRUSTED_IP_HEADER;
    delete process.env.VERCEL;
    expect(ipFromHeaders(h)).toBe("untrusted-network");
    process.env.TRUSTED_IP_HEADER = "x-real-ip";
    expect(ipFromHeaders(h)).toBe("1.2.3.4");
    process.env.TRUSTED_IP_HEADER = prev.t ?? "";
    if (prev.v) process.env.VERCEL = prev.v;
  });
});
