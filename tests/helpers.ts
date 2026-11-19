import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { events, eventStaff, memberships, organizations, ticketTypes, users } from "@/lib/db/schema";
import { designFromTheme } from "@/lib/events/design";

export async function resetDb() {
  await db.execute(sql`
    truncate table checkins, tickets, order_items, orders, ticket_types, staff_invites,
      event_staff, events, memberships, sessions, organizations, users, webhook_events
    restart identity cascade
  `);
}

let n = 0;
export async function makeOrg(role: "owner" | "staff" = "owner") {
  n++;
  const [user] = await db
    .insert(users)
    .values({ email: `u${n}-${Date.now()}@test.dev`, name: `User ${n}`, passwordHash: "x" })
    .returning();
  const [org] = await db.insert(organizations).values({ name: `Org ${n}`, slug: `org-${n}-${Date.now()}` }).returning();
  await db.insert(memberships).values({ userId: user.id, orgId: org.id, role });
  return { user, org };
}

export async function makeUser() {
  n++;
  const [user] = await db
    .insert(users)
    .values({ email: `s${n}-${Date.now()}@test.dev`, name: `Staff ${n}`, passwordHash: "x" })
    .returning();
  return user;
}

export async function makeEvent(orgId: string, opts: { capacity?: number | null; status?: "draft" | "published" } = {}) {
  n++;
  const start = new Date(Date.now() + 7 * 864e5);
  const [ev] = await db
    .insert(events)
    .values({
      orgId,
      slug: `ev-${n}-${Date.now()}`,
      status: opts.status ?? "published",
      title: `Event ${n}`,
      startsAt: start,
      endsAt: new Date(start.getTime() + 8 * 36e5),
      design: designFromTheme("afterhours"),
      capacity: opts.capacity ?? null,
      currency: "EUR",
    })
    .returning();
  return ev;
}

export async function makeTicketType(eventId: string, opts: { priceCents?: number; capacity?: number; maxPerOrder?: number } = {}) {
  const [tt] = await db
    .insert(ticketTypes)
    .values({
      eventId,
      name: "General",
      priceCents: opts.priceCents ?? 2500,
      capacity: opts.capacity ?? 100,
      maxPerOrder: opts.maxPerOrder ?? 10,
      tier: "general",
    })
    .returning();
  return tt;
}

export async function assignStaff(eventId: string, userId: string, orgId: string) {
  await db.insert(memberships).values({ userId, orgId, role: "staff" }).onConflictDoNothing();
  await db.insert(eventStaff).values({ eventId, userId });
}
