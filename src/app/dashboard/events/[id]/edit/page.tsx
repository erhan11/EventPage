import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Editor } from "@/components/editor/editor";
import { canAccessEvent } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/session";
import { getEventWithOrg } from "@/lib/events/queries";
import { utcToZonedLocal } from "@/lib/format";
import { activePaidProvider } from "@/lib/payments/provider";

export const metadata: Metadata = { title: "Edit event" };

export default async function EditEventPage({ params }: PageProps<"/dashboard/events/[id]/edit">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireUser(`/dashboard/events/${id}/edit`);
  if (!(await canAccessEvent(user.id, id, "manage"))) notFound();
  const row = await getEventWithOrg({ id });
  if (!row) notFound();
  const { event, orgName, types } = row;
  const tz = event.timezone;

  return (
    <Editor
      eventId={event.id}
      orgName={orgName}
      status={event.status}
      paymentsReady={activePaidProvider() !== null}
      initial={{
        title: event.title,
        slug: event.slug,
        tagline: event.tagline,
        description: event.description,
        startsLocal: utcToZonedLocal(event.startsAt, tz),
        endsLocal: utcToZonedLocal(event.endsAt, tz),
        timezone: tz,
        venueName: event.venueName,
        venueAddress: event.venueAddress,
        city: event.city,
        country: event.country,
        capacity: event.capacity,
        currency: event.currency as never,
        design: event.design,
        lineup: event.lineup,
        schedule: event.schedule,
        socials: event.socials,
      }}
      initialTypes={types.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        tier: t.tier,
        priceCents: t.priceCents,
        capacity: t.capacity,
        maxPerOrder: t.maxPerOrder,
        salesStartLocal: t.salesStartAt ? utcToZonedLocal(t.salesStartAt, tz) : "",
        salesEndLocal: t.salesEndAt ? utcToZonedLocal(t.salesEndAt, tz) : "",
        isActive: t.isActive,
        sold: t.sold,
        reserved: t.reserved,
      }))}
    />
  );
}
