import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { EventView } from "@/components/event/event-view";
import { getPublicEvent } from "@/lib/events/queries";
import { fmt } from "@/lib/format";
import { isTestMode } from "@/lib/payments/provider";

export async function generateMetadata({ params }: PageProps<"/e/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const event = await getPublicEvent(slug);
  if (!event) return { title: "Event not found" };
  const when = `${fmt.date(event.startsAt, event.timezone)} · ${event.venueName || event.city}`;
  return {
    title: event.title,
    description: event.tagline || `${when}. Tickets on EventPage.`,
    openGraph: { title: event.title, description: `${when} — ${event.tagline}`, type: "website" },
  };
}

export async function generateViewport({ params }: PageProps<"/e/[slug]">): Promise<Viewport> {
  const { slug } = await params;
  const event = await getPublicEvent(slug);
  return { themeColor: event?.design.background ?? "#0a0a0b" };
}

export default async function EventPage({ params, searchParams }: PageProps<"/e/[slug]">) {
  const { slug } = await params;
  const sp = await searchParams;
  const event = await getPublicEvent(slug);
  if (!event) notFound();

  const notice =
    sp.checkout === "cancelled" ? (
      <div role="status" className="relative z-40 mx-5 mt-2 rounded-2xl border border-ev-line bg-ev-surface px-4 py-3 text-sm @3xl:mx-10">
        Checkout cancelled — you have not been charged. Held tickets are released automatically.
      </div>
    ) : null;

  return (
    <main>
      <EventView event={event} testMode={isTestMode()} notice={notice} />
    </main>
  );
}
