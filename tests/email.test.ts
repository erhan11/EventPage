import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOrder, findOrderByAccessToken } from "@/lib/tickets/orders";
import { sendTicketsEmail } from "@/lib/tickets/notify";
import { makeEvent, makeOrg, makeTicketType, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  process.env.RESEND_API_KEY = "re_test";
  process.env.EMAIL_FROM = "EventPage <info@example.test>";
});
afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  vi.unstubAllGlobals();
});

describe("tickets email", () => {
  it("sends once under concurrent calls, with a working wallet link", async () => {
    const sent: { body: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      sent.push({ body: String(init.body) });
      return new Response(JSON.stringify({ id: "em_1" }), { status: 200 });
    }));
    const { org } = await makeOrg();
    const ev = await makeEvent(org.id);
    const tt = await makeTicketType(ev.id, { priceCents: 0 });
    const { order } = await createOrder({ eventId: ev.id, lines: [{ ticketTypeId: tt.id, quantity: 2 }], paidProvider: null, buyerName: "Ada Lovelace", buyerEmail: "ada@example.com" });

    await Promise.all(Array.from({ length: 5 }, () => sendTicketsEmail(order.id)));
    expect(sent).toHaveLength(1);
    const body = JSON.parse(sent[0].body) as { to: string[]; html: string; text: string };
    expect(body.to).toEqual(["ada@example.com"]);
    const token = decodeURIComponent(/\?t=([^\s"&]+)/.exec(body.text)![1]);
    expect((await findOrderByAccessToken(order.id, token))?.id).toBe(order.id);
  });

  it("does nothing for unpaid orders and retries after a failed send", async () => {
    let fail = true;
    const calls = vi.fn(async () => (fail ? new Response("nope", { status: 500 }) : new Response("{}", { status: 200 })));
    vi.stubGlobal("fetch", calls);
    const { org } = await makeOrg();
    const ev = await makeEvent(org.id);
    const paidType = await makeTicketType(ev.id, { priceCents: 1000 });
    const pending = await createOrder({ eventId: ev.id, lines: [{ ticketTypeId: paidType.id, quantity: 1 }], paidProvider: "test_simulator", buyerName: "Bo Bee", buyerEmail: "bo@example.com" });
    await sendTicketsEmail(pending.order.id);
    expect(calls).not.toHaveBeenCalled();

    const freeType = await makeTicketType(ev.id, { priceCents: 0 });
    const free = await createOrder({ eventId: ev.id, lines: [{ ticketTypeId: freeType.id, quantity: 1 }], paidProvider: null, buyerName: "Cy Dee", buyerEmail: "cy@example.com" });
    await sendTicketsEmail(free.order.id);
    fail = false;
    await sendTicketsEmail(free.order.id);
    expect(calls).toHaveBeenCalledTimes(2);
  });
});
