"use server";

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertEventAccess, getManagedOrgId } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { events, eventStaff, memberships, orders, staffInvites, ticketTypes, users } from "@/lib/db/schema";
import { designFromTheme } from "@/lib/events/design";
import type { ThemeId } from "@/lib/events/types";
import { eventDraftSchema, ticketTypeSchema, type EventDraft, type TicketTypeInput } from "@/lib/events/validation";
import { env } from "@/lib/env";
import { slugify, zonedLocalToUtc } from "@/lib/format";
import { activePaidProvider } from "@/lib/payments/provider";
import { refundStripePayment } from "@/lib/payments/stripe";
import { randomToken, sha256 } from "@/lib/security/crypto";
import { beginRefund, confirmRefund } from "@/lib/tickets/orders";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertIds(...ids: string[]) {
  if (!ids.every((id) => typeof id === "string" && UUID_RE.test(id))) throw new Error("Invalid id");
}

async function managerFor(eventId: string, ...childIds: string[]) {
  assertIds(eventId, ...childIds);
  const user = await requireUser();
  await assertEventAccess(user.id, eventId, "manage");
  return user;
}

const uid = () => randomToken(6);

export async function createEvent(form: FormData) {
  const user = await requireUser("/dashboard");
  const orgId = await getManagedOrgId(user.id);
  if (!orgId) redirect("/scan");
  const theme = (["afterhours", "littoral", "warehouse", "aurora", "chrome"] as ThemeId[]).includes(form.get("theme") as ThemeId)
    ? (form.get("theme") as ThemeId)
    : "afterhours";

  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 21);
  start.setUTCHours(21, 0, 0, 0);
  const end = new Date(start.getTime() + 9 * 36e5);
  const title = "Untitled Night";

  const [ev] = await db
    .insert(events)
    .values({
      orgId,
      slug: `${slugify(title)}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, "x")}`,
      title,
      tagline: "",
      startsAt: start,
      endsAt: end,
      timezone: "Europe/Berlin",
      design: designFromTheme(theme, Math.floor(Math.random() * 10_000)),
      lineup: [
        { id: uid(), name: "", billing: "Headliner", genre: "", time: "" },
      ],
      schedule: [
        { id: uid(), time: "22:00", label: "Doors" },
        { id: uid(), time: "06:00", label: "Close" },
      ],
    })
    .returning({ id: events.id });

  await db.insert(ticketTypes).values([
    { eventId: ev.id, name: "Early Bird", tier: "early_bird", priceCents: 1500, capacity: 100, sort: 0 },
    { eventId: ev.id, name: "General Admission", tier: "general", priceCents: 2200, capacity: 300, sort: 1 },
    { eventId: ev.id, name: "VIP", tier: "vip", priceCents: 4500, capacity: 40, sort: 2, description: "Fast-lane entry and balcony access." },
  ]);
  redirect(`/dashboard/events/${ev.id}/edit`);
}

export async function saveEventDraft(eventId: string, draft: EventDraft): Promise<Result<{ savedAt: string }>> {
  await managerFor(eventId);
  const parsed = eventDraftSchema.safeParse(draft);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;

  const [clash] = await db.select({ id: events.id }).from(events).where(and(eq(events.slug, d.slug), ne(events.id, eventId))).limit(1);
  if (clash) return { ok: false, error: "That URL is taken — try another." };

  const [current] = await db.select({ status: events.status, currency: events.currency }).from(events).where(eq(events.id, eventId));
  if (current.status !== "draft" && current.currency !== d.currency) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(orders).where(eq(orders.eventId, eventId));
    if (n > 0) return { ok: false, error: "Currency can't change after orders exist." };
  }

  await db
    .update(events)
    .set({
      title: d.title || "Untitled Night",
      slug: d.slug,
      tagline: d.tagline,
      description: d.description,
      startsAt: zonedLocalToUtc(d.startsLocal, d.timezone),
      endsAt: zonedLocalToUtc(d.endsLocal, d.timezone),
      timezone: d.timezone,
      venueName: d.venueName,
      venueAddress: d.venueAddress,
      city: d.city,
      country: d.country,
      capacity: d.capacity,
      currency: d.currency,
      design: d.design,
      lineup: d.lineup,
      schedule: d.schedule,
      socials: Object.fromEntries(Object.entries(d.socials).filter(([, v]) => v)),
      updatedAt: new Date(),
    })
    .where(eq(events.id, eventId));
  revalidatePath(`/e/${d.slug}`);
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function saveTicketType(eventId: string, input: TicketTypeInput): Promise<Result<{ id: string }>> {
  await managerFor(eventId);
  const parsed = ticketTypeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const t = parsed.data;
  const [ev] = await db.select({ timezone: events.timezone }).from(events).where(eq(events.id, eventId));
  const salesStartAt = t.salesStartLocal ? zonedLocalToUtc(t.salesStartLocal, ev.timezone) : null;
  const salesEndAt = t.salesEndLocal ? zonedLocalToUtc(t.salesEndLocal, ev.timezone) : null;
  const priceCents = t.tier === "free" ? 0 : t.priceCents;

  if (t.id) {
    // Capacity can never drop below what is already sold or held.
    const updated = await db
      .update(ticketTypes)
      .set({ name: t.name, description: t.description, tier: t.tier, priceCents, capacity: t.capacity, maxPerOrder: t.maxPerOrder, salesStartAt, salesEndAt, isActive: t.isActive })
      .where(and(eq(ticketTypes.id, t.id), eq(ticketTypes.eventId, eventId), sql`${ticketTypes.sold} + ${ticketTypes.reserved} <= ${t.capacity}`))
      .returning({ id: ticketTypes.id });
    if (updated.length === 0) return { ok: false, error: "Capacity can't be lower than tickets already sold or held." };
    revalidatePath(`/dashboard/events/${eventId}`);
    return { ok: true, id: updated[0].id };
  }
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(ticketTypes).where(eq(ticketTypes.eventId, eventId));
  if (n >= 12) return { ok: false, error: "Up to 12 ticket types per event." };
  const [row] = await db
    .insert(ticketTypes)
    .values({ eventId, name: t.name, description: t.description, tier: t.tier, priceCents, capacity: t.capacity, maxPerOrder: t.maxPerOrder, salesStartAt, salesEndAt, isActive: t.isActive, sort: n })
    .returning({ id: ticketTypes.id });
  return { ok: true, id: row.id };
}

export async function deleteTicketType(eventId: string, ticketTypeId: string): Promise<Result> {
  await managerFor(eventId, ticketTypeId);
  const deleted = await db
    .delete(ticketTypes)
    .where(and(eq(ticketTypes.id, ticketTypeId), eq(ticketTypes.eventId, eventId), eq(ticketTypes.sold, 0), eq(ticketTypes.reserved, 0)))
    .returning({ id: ticketTypes.id })
    .catch(() => []);
  if (deleted.length === 0) return { ok: false, error: "This ticket has orders — hide it instead of deleting." };
  return { ok: true };
}

export async function setEventStatus(eventId: string, status: "published" | "draft" | "cancelled"): Promise<Result> {
  await managerFor(eventId);
  const [ev] = await db.select().from(events).where(eq(events.id, eventId));
  if (status === "published") {
    const types = await db.select().from(ticketTypes).where(and(eq(ticketTypes.eventId, eventId), eq(ticketTypes.isActive, true)));
    const problems = [
      !ev.title.trim() || ev.title === "Untitled Night" ? "give the event a name" : null,
      !ev.venueName.trim() ? "add a venue" : null,
      types.length === 0 ? "add at least one ticket" : null,
      ev.endsAt <= new Date() ? "set a future date" : null,
      types.some((t) => t.priceCents > 0) && !activePaidProvider() ? "connect payments (or make all tickets free)" : null,
    ].filter(Boolean);
    if (problems.length) return { ok: false, error: `Before publishing: ${problems.join(", ")}.` };
  }
  if (ev.status === "cancelled" && status !== "cancelled") return { ok: false, error: "Cancelled events can't be reopened." };
  await db
    .update(events)
    .set({ status, publishedAt: status === "published" ? (ev.publishedAt ?? new Date()) : ev.publishedAt, updatedAt: new Date() })
    .where(eq(events.id, eventId));
  revalidatePath(`/e/${ev.slug}`);
  revalidatePath(`/dashboard/events/${eventId}`);
  return { ok: true };
}

export async function refundOrder(eventId: string, orderId: string): Promise<Result> {
  await managerFor(eventId, orderId);
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.eventId, eventId)));
  if (!order) return { ok: false, error: "Order not found." };
  // A Stripe refund that failed earlier can be retried (tickets are already void).
  const retry = order.status === "refund_pending" && order.provider === "stripe";
  if (!retry) {
    const r = await beginRefund(order.id);
    if (!r) return { ok: false, error: "Only paid orders can be refunded." };
  }
  if (order.provider === "stripe") {
    if (!order.providerPaymentId) return { ok: false, error: "Missing payment reference — refund in the Stripe dashboard." };
    try {
      await refundStripePayment(order.providerPaymentId, order.id);
    } catch (e) {
      console.error("stripe refund failed", e);
      return { ok: false, error: "Tickets were voided but Stripe refused the refund — finish it in the Stripe dashboard." };
    }
  } else if (order.provider === "test_simulator") {
    // Test gateway confirms refunds synchronously.
    await confirmRefund(order.id);
  }
  revalidatePath(`/dashboard/events/${eventId}`);
  return { ok: true };
}

export async function inviteStaff(eventId: string, email: string): Promise<Result<{ url: string }>> {
  const user = await managerFor(eventId);
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) || clean.length > 120) return { ok: false, error: "Enter a valid email." };
  const [ev] = await db.select({ orgId: events.orgId }).from(events).where(eq(events.id, eventId));
  const token = randomToken(24);
  await db.insert(staffInvites).values({
    tokenHash: sha256(token),
    orgId: ev.orgId,
    eventId,
    email: clean,
    createdBy: user.id,
    expiresAt: new Date(Date.now() + 7 * 864e5),
  });
  return { ok: true, url: `${env.appUrl}/invite/${token}` };
}

export async function removeStaff(eventId: string, userId: string): Promise<Result> {
  await managerFor(eventId, userId);
  await db.delete(eventStaff).where(and(eq(eventStaff.eventId, eventId), eq(eventStaff.userId, userId)));
  // Revoke any unused invites for this person to this event.
  const [person] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  if (person)
    await db
      .delete(staffInvites)
      .where(and(eq(staffInvites.eventId, eventId), sql`lower(${staffInvites.email}) = ${person.email.toLowerCase()}`, isNull(staffInvites.acceptedAt)));
  // Drop org membership if the person no longer staffs any event of this org.
  const [ev] = await db.select({ orgId: events.orgId }).from(events).where(eq(events.id, eventId));
  const [still] = await db
    .select({ e: eventStaff.eventId })
    .from(eventStaff)
    .innerJoin(events, eq(events.id, eventStaff.eventId))
    .where(and(eq(eventStaff.userId, userId), eq(events.orgId, ev.orgId)))
    .limit(1);
  if (!still) await db.delete(memberships).where(and(eq(memberships.userId, userId), eq(memberships.orgId, ev.orgId), eq(memberships.role, "staff")));
  revalidatePath(`/dashboard/events/${eventId}`);
  return { ok: true };
}
