import { ImageResponse } from "next/og";
import { getPublicEvent } from "@/lib/events/queries";
import { fmt } from "@/lib/format";

/**
 * Social share card (WhatsApp/Instagram/Twitter preview) rendered from the event's
 * own palette — the link promoters paste everywhere now looks like a poster.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Event poster";

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getPublicEvent(slug);
  const bg = event?.design.background ?? "#0a0a0b";
  const fg = event?.design.foreground ?? "#f2f1ec";
  const accent = event?.design.accent ?? "#d4ff3a";
  const title = event?.title ?? "EventPage";
  const tz = event?.timezone ?? "UTC";
  const when = event ? `${fmt.stamp(event.startsAt, tz)} · ${fmt.time(event.startsAt, tz)}` : "";
  const where = event ? [event.venueName, event.city].filter(Boolean).join(", ") : "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: bg,
          color: fg,
          padding: "56px 64px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 26, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.85 }}>
          <span>{event?.orgName ?? "EventPage"}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ width: 16, height: 16, background: accent, borderRadius: 999 }} />
            {when}
          </span>
        </div>
        <div
          style={{
            fontSize: title.length > 22 ? 84 : title.length > 12 ? 116 : 150,
            fontWeight: 700,
            lineHeight: 0.95,
            letterSpacing: "-0.04em",
            textTransform: "uppercase",
            maxWidth: 1050,
          }}
        >
          {title}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <span style={{ fontSize: 30, opacity: 0.85 }}>{where}</span>
          <span style={{ display: "flex", fontSize: 26, background: accent, color: bg, padding: "14px 30px", borderRadius: 999, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Tickets
          </span>
        </div>
        <div style={{ position: "absolute", left: 0, bottom: 0, width: "100%", height: 10, background: accent, display: "flex" }} />
      </div>
    ),
    size,
  );
}
