import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { events, organizations, ticketTypes, type Event, type TicketType } from "@/lib/db/schema";
import { availabilityOf, type EventViewModel } from "./view";

export function toViewModel(event: Event, orgName: string, types: TicketType[], now = new Date()): EventViewModel {
  return {
    id: event.id,
    slug: event.slug,
    orgName,
    title: event.title,
    tagline: event.tagline,
    description: event.description,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    timezone: event.timezone,
    venueName: event.venueName,
    venueAddress: event.venueAddress,
    city: event.city,
    country: event.country,
    currency: event.currency,
    design: event.design,
    lineup: event.lineup,
    schedule: event.schedule,
    socials: event.socials,
    status: event.status,
    tickets: types
      .filter((t) => t.isActive)
      .sort((a, b) => a.sort - b.sort || a.priceCents - b.priceCents)
      .map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        tier: t.tier,
        priceCents: t.priceCents,
        maxPerOrder: t.maxPerOrder,
        availability: event.endsAt <= now ? "ended" : availabilityOf(t, now),
        salesStartAt: t.salesStartAt?.toISOString() ?? null,
      })),
  };
}

export async function getEventWithOrg(where: { slug: string } | { id: string }) {
  const [row] = await db
    .select({ event: events, orgName: organizations.name })
    .from(events)
    .innerJoin(organizations, eq(organizations.id, events.orgId))
    .where("slug" in where ? eq(events.slug, where.slug) : eq(events.id, where.id))
    .limit(1);
  if (!row) return null;
  const types = await db.select().from(ticketTypes).where(eq(ticketTypes.eventId, row.event.id)).orderBy(asc(ticketTypes.sort));
  return { ...row, types };
}

/** Published (or cancelled) events only — drafts are never public. */
export async function getPublicEvent(slug: string): Promise<EventViewModel | null> {
  const row = await getEventWithOrg({ slug });
  if (!row || row.event.status === "draft") return null;
  return toViewModel(row.event, row.orgName, row.types);
}
