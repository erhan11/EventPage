import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { canAccessEvent } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { orders, tickets, ticketTypes } from "@/lib/db/schema";
import { createTicketToken } from "@/lib/security/ticket-token";
import { scanTicket } from "@/lib/tickets/checkin";
import { CheckoutError } from "@/lib/tickets/errors";
import {
  beginRefund,
  closePendingOrder,
  createOrder,
  expireStaleOrders,
  fulfillOrder,
  fulfillOrderOrFlag,
} from "@/lib/tickets/orders";
import { assignStaff, makeEvent, makeOrg, makeTicketType, makeUser, resetDb } from "./helpers";

const SECRET = process.env.TICKET_SIGNING_SECRET!;
const buyer = { buyerName: "Ada Lovelace", buyerEmail: "ada@example.com" };

async function ticketType(id: string) {
  const [t] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, id));
  return t;
}

beforeEach(resetDb);

describe("inventory", () => {
  it("never oversells under concurrent checkouts", async () => {
    const { org } = await makeOrg();
    const ev = await makeEvent(org.id);
    const tt = await makeTicketType(ev.id, { capacity: 5 });

    const attempts = await Promise.allSettled(
      Array.from({ length: 25 }, () =>
        createOrder({ eventId: ev.id, lines: [{ ticketTypeId: tt.id, quantity: 1 }], paidProvider: "test_simulator", ...buyer }),
      ),
    );
    const ok = attempts.filter((a) => a.status === "fulfilled");
    const failed = attempts.filter((a) => a.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(5);
    expect(failed.every((f) => f.reason instanceof CheckoutError && f.reason.code === "SOLD_OUT")).toBe(true);
    const after = await ticketType(tt.id);
    expect(after.reserved).toBe(5);
    expect(after.sold).toBe(0);
  });

  it("enforces event-wide capacity across ticket types", async () => {
    const { org } = await makeOrg();
    const ev = await makeEvent(org.id, { capacity: 3 });
    const a = await makeTicketType(ev.id, { capacity: 10, priceCents: 0 });
    const b = await makeTicketType(ev.id, { capacity: 10, priceCents: 0 });
    await createOrder({ eventId: ev.id, lines: [{ ticketTypeId: a.id, quantity: 2 }], paidProvider: null, ...buyer });
    await expect(
      createOrder({ eventId: ev.id, lines: [{ ticketTypeId: b.id, quantity: 2 }], paidProvider: null, ...buyer }),
    ).rejects.toMatchObject({ code: "SOLD_OUT" });
  });

  it("rejects ticket types from another event and draft events", async () => {
    const { org } = await makeOrg();
    const ev1 = await makeEvent(org.id);
    const ev2 = await makeEvent(org.id);
    const draft = await makeEvent(org.id, { status: "draft" });
    const foreign = await makeTicketType(ev2.id);
    const draftType = await makeTicketType(draft.id);
    await expect(
      createOrder({ eventId: ev1.id, lines: [{ ticketTypeId: foreign.id, quantity: 1 }], paidProvider: "test_simulator", ...buyer }),
    ).rejects.toMatchObject({ code: "INVALID_SELECTION" });
    await expect(
      createOrder({ eventId: draft.id, lines: [{ ticketTypeId: draftType.id, quantity: 1 }], paidProvider: "test_simulator", ...buyer }),
    ).rejects.toMatchObject({ code: "EVENT_UNAVAILABLE" });
  });

  it("releases inventory when a pending checkout expires", async () => {
    const { org } = await makeOrg();
    const ev = await makeEvent(org.id);
    const tt = await makeTicketType(ev.id, { capacity: 2 });
    const { order } = await createOrder({ eventId: ev.id, lines: [{ ticketTypeId: tt.id, quantity: 2 }], paidProvider: "test_simulator", ...buyer });
    expect((await ticketType(tt.id)).reserved).toBe(2);
    const released = await expireStaleOrders(new Date(order.expiresAt.getTime() + 1000));
    expect(released).toBe(1);
    expect((await ticketType(tt.id)).reserved).toBe(0);
    // Idempotent: closing again is a no-op.
    expect(await closePendingOrder(order.id, "expired")).toBe(false);
  });
});

describe("payment & issuance", () => {
  it("issues no tickets for a paid order until payment is verified", async () => {
    const { org } = await makeOrg();
    const ev = await makeEvent(org.id);
    const tt = await makeTicketType(ev.id, { priceCents: 3000 });
    const { order } = await createOrder({ eventId: ev.id, lines: [{ ticketTypeId: tt.id, quantity: 2 }], paidProvider: "test_simulator", ...buyer });
    expect(order.status).toBe("pending");
    expect(order.totalCents).toBe(6000);
    expect(await db.select().from(tickets).where(eq(tickets.orderId, order.id))).toHaveLength(0);
  });

  it("refuses to create paid orders when no payment provider is available", async () => {
    const { org } = await makeOrg();
    const ev = await makeEvent(org.id);
    const tt = await makeTicketType(ev.id, { priceCents: 3000, capacity: 1 });
    await expect(
      createOrder({ eventId: ev.id, lines: [{ ticketTypeId: tt.id, quantity: 1 }], paidProvider: null, ...buyer }),
    ).rejects.toMatchObject({ code: "PAYMENTS_UNAVAILABLE" });
    // The failed transaction rolled back its reservation.
    expect((await ticketType(tt.id)).reserved).toBe(0);
  });

  it("issues tickets exactly once even if the webhook is delivered concurrently and repeatedly", async () => {
    const { org } = await makeOrg();
    const ev = await makeEvent(org.id);
    const tt = await makeTicketType(ev.id, { priceCents: 2000 });
    const { order } = await createOrder({ eventId: ev.id, lines: [{ ticketTypeId: tt.id, quantity: 3 }], paidProvider: "test_simulator", ...buyer });
    const payment = { amountCents: 6000, currency: "EUR", paymentId: "pi_1" };
    const results = await Promise.all(Array.from({ length: 6 }, () => fulfillOrder(order.id, payment)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.select().from(tickets).where(eq(tickets.orderId, order.id))).toHaveLength(3);
    const t = await ticketType(tt.id);
    expect([t.sold, t.reserved]).toEqual([3, 0]);
  });

  it("does not issue tickets when the paid amount does not match", async () => {
    const { org } = await makeOrg();
    const ev = await makeEvent(org.id);
    const tt = await makeTicketType(ev.id, { priceCents: 2000 });
    const { order } = await createOrder({ eventId: ev.id, lines: [{ ticketTypeId: tt.id, quantity: 1 }], paidProvider: "test_simulator", ...buyer });
    const r = await fulfillOrder(order.id, { amountCents: 1, currency: "EUR", paymentId: "pi_x" });
    expect(r.status).toBe("needs_refund");
    expect(await db.select().from(tickets).where(eq(tickets.orderId, order.id))).toHaveLength(0);
    expect((await ticketType(tt.id)).reserved).toBe(0);
  });

  it("flags a late payment for refund when the released inventory was resold", async () => {
    const { org } = await makeOrg();
    const ev = await makeEvent(org.id);
    const tt = await makeTicketType(ev.id, { priceCents: 1000, capacity: 1 });
    const { order } = await createOrder({ eventId: ev.id, lines: [{ ticketTypeId: tt.id, quantity: 1 }], paidProvider: "test_simulator", ...buyer });
    await closePendingOrder(order.id, "expired");
    const second = await createOrder({ eventId: ev.id, lines: [{ ticketTypeId: tt.id, quantity: 1 }], paidProvider: "test_simulator", ...buyer });
    await fulfillOrder(second.order.id, { amountCents: 1000, currency: "EUR", paymentId: "pi_2" });

    const late = await fulfillOrderOrFlag(order.id, { amountCents: 1000, currency: "EUR", paymentId: "pi_1" });
    expect(late.status).toBe("needs_refund");
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(o.status).toBe("refund_pending");
    expect((await ticketType(tt.id)).sold).toBe(1);
  });

  it("fulfills free orders immediately", async () => {
    const { org } = await makeOrg();
    const ev = await makeEvent(org.id);
    const tt = await makeTicketType(ev.id, { priceCents: 0 });
    const { order } = await createOrder({ eventId: ev.id, lines: [{ ticketTypeId: tt.id, quantity: 2 }], paidProvider: null, ...buyer });
    expect(order.status).toBe("paid");
    expect(order.provider).toBe("free");
    expect(await db.select().from(tickets).where(eq(tickets.orderId, order.id))).toHaveLength(2);
  });

  it("refund voids unused tickets and returns them to inventory", async () => {
    const { org, user } = await makeOrg();
    const ev = await makeEvent(org.id);
    const tt = await makeTicketType(ev.id, { priceCents: 0 });
    const { order } = await createOrder({ eventId: ev.id, lines: [{ ticketTypeId: tt.id, quantity: 2 }], paidProvider: null, ...buyer });
    const [first] = await db.select().from(tickets).where(eq(tickets.orderId, order.id));
    await scanTicket({ input: createTicketToken(first.id, SECRET), eventId: ev.id, staffUserId: user.id, signingSecret: SECRET });

    const r = await beginRefund(order.id);
    expect(r?.voided).toBe(1);
    expect(r?.order.status).toBe("refunded");
    expect((await ticketType(tt.id)).sold).toBe(1); // the used ticket still counts
  });
});

describe("door check-in", () => {
  async function paidTicket() {
    const { org, user } = await makeOrg();
    const ev = await makeEvent(org.id);
    const tt = await makeTicketType(ev.id, { priceCents: 0 });
    const { order } = await createOrder({ eventId: ev.id, lines: [{ ticketTypeId: tt.id, quantity: 1 }], paidProvider: null, ...buyer });
    const [t] = await db.select().from(tickets).where(eq(tickets.orderId, order.id));
    return { org, user, ev, ticket: t, token: createTicketToken(t.id, SECRET) };
  }

  it("admits exactly once when many scanners race on the same ticket", async () => {
    const { user, ev, token } = await paidTicket();
    const results = await Promise.all(
      Array.from({ length: 12 }, () => scanTicket({ input: token, eventId: ev.id, staffUserId: user.id, signingSecret: SECRET })),
    );
    expect(results.filter((r) => r.outcome === "admitted")).toHaveLength(1);
    expect(results.filter((r) => r.outcome === "already_checked_in")).toHaveLength(11);
    expect(results.at(-1)!.totals).toEqual({ checkedIn: 1, issued: 1 });
  });

  it("rejects forged and tampered QR tokens", async () => {
    const { user, ev, token, ticket } = await paidTicket();
    const forged = createTicketToken(ticket.id, "attacker-secret-attacker-secret-attacker");
    const tampered = token.slice(0, -2) + (token.endsWith("AA") ? "BB" : "AA");
    for (const input of [forged, tampered, "EP1.garbage.garbage", "' or 1=1 --"]) {
      const r = await scanTicket({ input, eventId: ev.id, staffUserId: user.id, signingSecret: SECRET });
      expect(r.outcome).toBe("invalid");
    }
    const [t] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    expect(t.status).toBe("valid");
  });

  it("rejects tickets for a different event without admitting them", async () => {
    const { user, org, token, ticket } = await paidTicket();
    const other = await makeEvent(org.id);
    const r = await scanTicket({ input: token, eventId: other.id, staffUserId: user.id, signingSecret: SECRET });
    expect(r.outcome).toBe("wrong_event");
    expect(r.ticket).toBeUndefined();
    const [t] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    expect(t.status).toBe("valid");
  });

  it("accepts the manual door code", async () => {
    const { user, ev, ticket } = await paidTicket();
    const r = await scanTicket({ input: ticket.code.toLowerCase(), eventId: ev.id, staffUserId: user.id, signingSecret: SECRET });
    expect(r.outcome).toBe("admitted");
  });

  it("rejects refunded tickets", async () => {
    const { user, ev, token, ticket } = await paidTicket();
    await beginRefund(ticket.orderId);
    const r = await scanTicket({ input: token, eventId: ev.id, staffUserId: user.id, signingSecret: SECRET });
    expect(r.outcome).toBe("void");
  });
});

describe("authorization", () => {
  it("restricts staff to their assigned events and organizers to their own org", async () => {
    const a = await makeOrg();
    const b = await makeOrg();
    const evA1 = await makeEvent(a.org.id);
    const evA2 = await makeEvent(a.org.id);
    const evB = await makeEvent(b.org.id);
    const staff = await makeUser();
    await assignStaff(evA1.id, staff.id, a.org.id);

    expect(await canAccessEvent(staff.id, evA1.id, "scan")).toBe(true);
    expect(await canAccessEvent(staff.id, evA1.id, "manage")).toBe(false);
    expect(await canAccessEvent(staff.id, evA2.id, "scan")).toBe(false);
    expect(await canAccessEvent(staff.id, evB.id, "scan")).toBe(false);

    expect(await canAccessEvent(a.user.id, evA2.id, "manage")).toBe(true);
    expect(await canAccessEvent(a.user.id, evB.id, "manage")).toBe(false);
    expect(await canAccessEvent(a.user.id, evB.id, "scan")).toBe(false);
  });
});
