import { getPublicEvent } from "@/lib/events/queries";
import { env } from "@/lib/env";

/** "Add to calendar" — a standards-plain .ics that Apple/Google/Outlook all open. */

const icsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

export async function GET(_req: Request, ctx: RouteContext<"/e/[slug]/ics">) {
  const { slug } = await ctx.params;
  const event = await getPublicEvent(slug);
  if (!event || event.status !== "published") return new Response("Not found", { status: 404 });

  const url = `${env.appUrl}/e/${event.slug}`;
  const location = [event.venueName, event.venueAddress, event.city, event.country].filter(Boolean).join(", ");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EventPage//Event//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@eventpage`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(event.startsAt)}`,
    `DTEND:${icsDate(event.endsAt)}`,
    `SUMMARY:${esc(event.title)}`,
    location ? `LOCATION:${esc(location)}` : "",
    `DESCRIPTION:${esc(`${event.tagline ? event.tagline + "\n\n" : ""}Tickets & info: ${url}`)}`,
    `URL:${url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return new Response(lines.join("\r\n"), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${event.slug}.ics"`,
      "cache-control": "public, max-age=300",
    },
  });
}
