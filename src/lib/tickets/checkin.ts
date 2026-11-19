import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { checkins, events, orders, tickets, ticketTypes } from "@/lib/db/schema";
import { verifyTicketToken } from "@/lib/security/ticket-token";

export type ScanOutcome = "admitted" | "already_checked_in" | "void" | "wrong_event" | "invalid";

export interface ScanResult {
  outcome: ScanOutcome;
  ticket?: {
    code: string;
    typeName: string;
    holder: string;
    checkedInAt: string | null;
  };
  totals: { checkedIn: number; issued: number };
}

const MANUAL_CODE = /^[23456789A-HJ-NP-Z]{8}$/;

/** Privacy: door staff see first name + last initial only. */
function shortName(full: string) {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

/**
 * Validates and admits a ticket. The admission is a single conditional UPDATE
 * (status 'valid' → 'checked_in'), so two scanners racing on the same ticket
 * can never both admit it: Postgres row locking guarantees exactly one winner.
 *
 * Caller must have already verified the staff member may scan for `eventId`.
 */
export async function scanTicket(params: {
  input: string;
  eventId: string;
  staffUserId: string;
  signingSecret: string;
}): Promise<ScanResult> {
  const raw = params.input.trim();
  let ticketId: string | null = null;
  let byCode: string | null = null;

  if (raw.startsWith("EP1.")) ticketId = verifyTicketToken(raw, params.signingSecret);
  else if (MANUAL_CODE.test(raw.toUpperCase().replace(/[\s-]/g, ""))) byCode = raw.toUpperCase().replace(/[\s-]/g, "");

  if (!ticketId && byCode) {
    const [t] = await db
      .select({ id: tickets.id })
      .from(tickets)
      .where(and(eq(tickets.eventId, params.eventId), eq(tickets.code, byCode)))
      .limit(1);
    ticketId = t?.id ?? null;
  }

  let outcome: ScanOutcome = "invalid";
  let resolvedId: string | null = null;

  // A cancelled event admits no one.
  const [ev] = await db.select({ status: events.status }).from(events).where(eq(events.id, params.eventId)).limit(1);
  if (ev?.status === "cancelled" && ticketId) {
    outcome = "void";
    ticketId = null;
  }

  if (ticketId) {
    const admitted = await db
      .update(tickets)
      .set({ status: "checked_in", checkedInAt: sql`now()`, checkedInBy: params.staffUserId })
      .where(and(eq(tickets.id, ticketId), eq(tickets.eventId, params.eventId), eq(tickets.status, "valid")))
      .returning({ id: tickets.id });

    if (admitted.length === 1) {
      outcome = "admitted";
      resolvedId = ticketId;
    } else {
      const [t] = await db
        .select({ eventId: tickets.eventId, status: tickets.status })
        .from(tickets)
        .where(eq(tickets.id, ticketId))
        .limit(1);
      if (!t) outcome = "invalid";
      else if (t.eventId !== params.eventId) outcome = "wrong_event"; // don't leak details of other events
      else {
        resolvedId = ticketId;
        outcome = t.status === "checked_in" ? "already_checked_in" : "void";
      }
    }
  }

  await db.insert(checkins).values({
    eventId: params.eventId,
    ticketId: resolvedId,
    staffUserId: params.staffUserId,
    result: outcome,
  });

  let ticket: ScanResult["ticket"];
  if (resolvedId) {
    const [row] = await db
      .select({
        code: tickets.code,
        typeName: ticketTypes.name,
        buyerName: orders.buyerName,
        checkedInAt: tickets.checkedInAt,
      })
      .from(tickets)
      .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
      .innerJoin(orders, eq(orders.id, tickets.orderId))
      .where(eq(tickets.id, resolvedId))
      .limit(1);
    if (row)
      ticket = {
        code: row.code,
        typeName: row.typeName,
        holder: shortName(row.buyerName),
        checkedInAt: row.checkedInAt?.toISOString() ?? null,
      };
  }

  return { outcome, ticket, totals: await checkinTotals(params.eventId) };
}

export async function checkinTotals(eventId: string) {
  const [row] = await db
    .select({
      checkedIn: sql<number>`count(*) filter (where ${tickets.status} = 'checked_in')::int`,
      issued: sql<number>`count(*) filter (where ${tickets.status} <> 'void')::int`,
    })
    .from(tickets)
    .where(eq(tickets.eventId, eventId));
  return { checkedIn: row?.checkedIn ?? 0, issued: row?.issued ?? 0 };
}
