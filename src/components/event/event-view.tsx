import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, CalendarPlus, MapPin } from "lucide-react";
import { designVars, THEMES } from "@/lib/events/design";
import type { EventViewModel } from "@/lib/events/view";
import { fmt } from "@/lib/format";
import { HeroArt } from "./hero-art";
import { TicketSelector } from "./ticket-selector";
import { TicketStickyBar } from "./ticket-sticky-bar";

const isPast = (iso: string) => new Date(iso).getTime() <= Date.now();

/**
 * The public event page. Uses container queries (@container) rather than viewport
 * breakpoints, so the editor's phone/desktop preview renders the real responsive layout.
 */
export function EventView({
  event,
  mode = "live",
  testMode = false,
  notice,
}: {
  event: EventViewModel;
  mode?: "live" | "preview";
  testMode?: boolean;
  notice?: React.ReactNode;
}) {
  const d = event.design;
  const tz = event.timezone;
  const dark = THEMES[d.theme]?.dark ?? true;
  const live = mode === "live";
  const headliners = event.lineup.filter((l) => l.name.trim());
  const past = isPast(event.endsAt);
  const onSale = event.status === "published" && !past;
  const statusLabel =
    event.status === "cancelled" ? "Cancelled" : event.status === "draft" ? "Draft preview" : past ? "Past event" : "On sale";
  const buyable = event.tickets.filter((t) => t.availability === "available" || t.availability === "low");
  // The sticky bar quotes the cheapest *paid* tier; "free entry" only when that is all there is.
  const paidFrom = buyable.filter((t) => t.priceCents > 0).map((t) => t.priceCents);

  return (
    <div
      style={designVars(d)}
      className="@container relative isolate min-h-full bg-ev-bg font-ev-body text-ev-fg antialiased"
      data-event-theme={d.theme}
    >
      {/* ── Top bar ─────────────────────────────────── */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-4 px-5 py-4 @3xl:px-10">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[color-mix(in_oklab,var(--ev-bg)_72%,transparent)] backdrop-blur-xl backdrop-saturate-150 [mask-image:linear-gradient(to_bottom,#000_60%,transparent)]" />
        <span className="truncate font-ev-mono text-[11px] tracking-[0.18em] uppercase">{event.orgName || "Presents"}</span>
        <div className="flex items-center gap-3">
          <span className="hidden font-ev-mono text-[11px] tracking-[0.18em] uppercase @2xl:inline">
            {fmt.stamp(event.startsAt, tz)} — {event.city || "TBA"}
          </span>
          <a
            href="#tickets"
            className="rounded-full bg-ev-accent px-4 py-2 font-ev-mono text-[11px] font-semibold tracking-[0.14em] text-ev-on-accent uppercase transition-transform duration-300 ease-[var(--ease-spring)] hover:scale-[1.04] active:scale-95"
          >
            Tickets
          </a>
        </div>
      </header>

      {notice}

      {/* ── Hero ────────────────────────────────────── */}
      <section
        className={`relative -mt-[68px] flex flex-col justify-end overflow-hidden ${live ? "min-h-[100svh]" : "min-h-[760px]"} grain`}
        aria-labelledby="event-title"
      >
        <div className="absolute inset-0 -z-10">
          <HeroArt style={d.art} seed={d.artSeed} imageUrl={d.heroImageUrl} />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(180deg, transparent 30%, color-mix(in oklab, var(--ev-bg) ${d.art === "image" ? 92 : 70}%, transparent) 78%, var(--ev-bg) 100%)`,
            }}
          />
        </div>

        <div className="px-5 pb-10 @3xl:px-10 @3xl:pb-14">
          <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 font-ev-mono text-[11px] tracking-[0.18em] uppercase animate-rise">
            <span className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                {onSale && (
                  <span className="absolute inline-flex h-full w-full rounded-full bg-ev-accent" style={{ animation: "pulse-ring 1.8s ease-out infinite" }} />
                )}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${onSale ? "bg-ev-accent" : "bg-ev-muted"}`} />
              </span>
              {statusLabel}
            </span>
            <span>{fmt.weekday(event.startsAt, tz)}</span>
            <span>
              {fmt.time(event.startsAt, tz)} – {fmt.time(event.endsAt, tz)}
            </span>
            {event.venueName && <span>{event.venueName}</span>}
          </div>

          <h1
            id="event-title"
            className="ev-display max-w-[14ch] text-[clamp(3.25rem,13.5cqi,14rem)] break-words animate-rise [animation-delay:80ms]"
          >
            {event.title || "Untitled night"}
          </h1>

          <div className="mt-8 grid gap-8 @3xl:mt-12 @3xl:grid-cols-[1fr_auto] @3xl:items-end">
            {event.tagline && (
              <p className="max-w-xl text-lg leading-snug text-ev-fg/85 @3xl:text-2xl animate-rise [animation-delay:160ms]">
                {event.tagline}
              </p>
            )}
            <div className="flex items-end gap-5 animate-rise [animation-delay:220ms]">
              <div className="ev-display text-[clamp(4rem,11cqi,9rem)] leading-[0.8] tabular">{fmt.day(event.startsAt, tz)}</div>
              <div className="pb-1 font-ev-mono text-xs leading-relaxed tracking-[0.16em] uppercase">
                <div>{fmt.month(event.startsAt, tz)}</div>
                <div className="text-ev-muted">{fmt.year(event.startsAt, tz)}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Lineup marquee ──────────────────────────── */}
      {headliners.length > 0 && (
        <div className="overflow-hidden border-y border-ev-line py-4" aria-hidden>
          <div className="flex w-max animate-marquee gap-10 whitespace-nowrap">
            {[0, 1].map((k) => (
              <div key={k} className="flex gap-10">
                {Array.from({ length: Math.max(2, Math.ceil(8 / headliners.length)) }).flatMap((_, j) =>
                  headliners.map((l) => (
                    <span key={`${k}-${j}-${l.id}`} className="ev-display flex items-center gap-10 text-3xl @3xl:text-5xl">
                      {l.name}
                      <span className="inline-block h-2 w-2 rotate-45 bg-ev-accent" />
                    </span>
                  )),
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── About ───────────────────────────────────── */}
      {event.description && (
        <section className="grid gap-8 px-5 py-20 @3xl:grid-cols-12 @3xl:px-10 @3xl:py-32">
          <SectionLabel index="01" className="@3xl:col-span-3">
            The night
          </SectionLabel>
          <div className="@3xl:col-span-8 @3xl:col-start-5">
            {event.description.split(/\n{2,}/).map((p, i) => (
              <p
                key={i}
                className={
                  i === 0
                    ? "text-2xl leading-[1.25] tracking-[-0.01em] @3xl:text-[2.1rem] first-letter:float-left first-letter:mr-3 first-letter:font-ev-display first-letter:text-[4.2em] first-letter:leading-[0.8] first-letter:text-ev-accent"
                    : "mt-6 max-w-2xl text-lg leading-relaxed text-ev-muted"
                }
              >
                {p}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* ── Lineup ──────────────────────────────────── */}
      {headliners.length > 0 && (
        <section className="px-5 pb-20 @3xl:px-10 @3xl:pb-32" aria-labelledby="lineup-h">
          <div className="mb-8 flex items-baseline justify-between border-b border-ev-line pb-4">
            <SectionLabel index="02">
              <span id="lineup-h">Lineup</span>
            </SectionLabel>
            <span className="font-ev-mono text-[11px] tracking-[0.18em] text-ev-muted uppercase">{headliners.length} artists</span>
          </div>
          <ol>
            {headliners.map((l, i) => (
              <li
                key={l.id}
                className="group grid grid-cols-[2.5rem_1fr] items-baseline gap-x-4 border-b border-ev-line py-5 transition-colors duration-500 hover:bg-ev-surface @3xl:grid-cols-[4rem_1fr_12rem_8rem] @3xl:py-7"
              >
                <span className="font-ev-mono text-xs text-ev-muted tabular">{String(i + 1).padStart(2, "0")}</span>
                <span className="ev-display text-[clamp(2rem,7cqi,5.5rem)] transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:translate-x-2">
                  {l.name}
                </span>
                <span className="col-start-2 mt-2 font-ev-mono text-[11px] tracking-[0.16em] text-ev-muted uppercase @3xl:col-start-auto @3xl:mt-0">
                  {[l.billing, l.genre].filter(Boolean).join(" · ")}
                </span>
                <span className="col-start-2 font-ev-mono text-sm tabular @3xl:col-start-auto @3xl:text-right">
                  {l.time && <span className="text-ev-accent">{l.time}</span>}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ── Schedule + venue ────────────────────────── */}
      <section className="grid gap-16 px-5 pb-20 @3xl:grid-cols-2 @3xl:gap-10 @3xl:px-10 @3xl:pb-32">
        {event.schedule.length > 0 && (
          <div>
            <SectionLabel index="03" className="mb-8 border-b border-ev-line pb-4">
              Running order
            </SectionLabel>
            <ol className="relative ml-1 border-l border-ev-line">
              {event.schedule.map((s) => (
                <li key={s.id} className="relative pb-7 pl-7 last:pb-0">
                  <span className="absolute top-1.5 -left-[5px] h-[9px] w-[9px] rounded-full border-2 border-ev-accent bg-ev-bg" />
                  <div className="font-ev-mono text-sm text-ev-accent tabular">{s.time}</div>
                  <div className="mt-1 text-lg">{s.label}</div>
                </li>
              ))}
            </ol>
          </div>
        )}
        <div className={event.schedule.length === 0 ? "@3xl:col-span-2" : ""}>
          <SectionLabel index={event.schedule.length ? "04" : "03"} className="mb-8 border-b border-ev-line pb-4">
            Venue
          </SectionLabel>
          <div className="ev-display text-[clamp(2.25rem,6cqi,4.5rem)]">{event.venueName || "Venue TBA"}</div>
          <address className="mt-5 text-lg leading-relaxed text-ev-muted not-italic">
            {event.venueAddress && <div>{event.venueAddress}</div>}
            <div>{[event.city, event.country].filter(Boolean).join(", ")}</div>
          </address>
          <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ev-line bg-ev-line">
            {[
              ["Doors", fmt.time(event.startsAt, tz)],
              ["Close", fmt.time(event.endsAt, tz)],
              ["Date", fmt.date(event.startsAt, tz)],
              ["Timezone", tz.split("/").pop()!.replace(/_/g, " ")],
            ].map(([k, v]) => (
              <div key={k} className="bg-ev-bg p-4">
                <dt className="font-ev-mono text-[10px] tracking-[0.18em] text-ev-muted uppercase">{k}</dt>
                <dd className="mt-1 text-lg tabular">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3">
            {(event.venueAddress || event.city) && (
              <a
                className="inline-flex items-center gap-2 font-ev-mono text-xs tracking-[0.14em] uppercase underline decoration-ev-accent decoration-2 underline-offset-4 hover:text-ev-accent"
                href={`https://www.openstreetmap.org/search?query=${encodeURIComponent([event.venueName, event.venueAddress, event.city].filter(Boolean).join(", "))}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MapPin size={14} aria-hidden /> Open map <ArrowUpRight size={14} aria-hidden />
              </a>
            )}
            {live && (
              <a
                className="inline-flex items-center gap-2 font-ev-mono text-xs tracking-[0.14em] uppercase underline decoration-ev-accent decoration-2 underline-offset-4 hover:text-ev-accent"
                href={`/e/${event.slug}/ics`}
              >
                <CalendarPlus size={14} aria-hidden /> Add to calendar
              </a>
            )}
          </div>
        </div>
      </section>

      {/* ── Tickets ─────────────────────────────────── */}
      <section id="tickets" className="scroll-mt-20 border-t border-ev-line px-5 py-20 @3xl:px-10 @3xl:py-28" aria-labelledby="tickets-h">
        <div className="mb-10 grid gap-6 @3xl:grid-cols-12">
          <div className="@3xl:col-span-5">
            <SectionLabel index="→">Admission</SectionLabel>
            <h2 id="tickets-h" className="ev-display mt-4 text-[clamp(2.75rem,8cqi,6.5rem)]">
              Tickets
            </h2>
          </div>
          <p className="self-end text-ev-muted @3xl:col-span-5 @3xl:col-start-8">
            Your ticket arrives instantly as a QR code. One scan per ticket at the door — screenshots work, but
            don&apos;t share them.
          </p>
        </div>
        <TicketSelector
          eventId={event.id}
          slug={event.slug}
          currency={event.currency}
          timezone={event.timezone}
          options={event.tickets}
          disabled={!live || event.status !== "published"}
          disabledReason={!live ? "Checkout is disabled in preview" : event.status === "cancelled" ? "This event was cancelled" : "Sales are not open"}
          testMode={testMode}
          dark={dark}
        />
      </section>

      {/* ── Footer ──────────────────────────────────── */}
      {live && onSale && buyable.length > 0 && (
        <TicketStickyBar fromCents={paidFrom.length ? Math.min(...paidFrom) : 0} currency={event.currency} />
      )}

      <footer className="border-t border-ev-line px-5 pt-14 pb-10 @3xl:px-10">
        <div className="flex flex-col justify-between gap-10 @3xl:flex-row @3xl:items-end">
          <div className="ev-display text-[clamp(2.5rem,10cqi,8rem)] text-ev-fg/90">{event.title || "Untitled"}</div>
          <ul className="flex flex-wrap gap-x-6 gap-y-3 font-ev-mono text-xs tracking-[0.14em] uppercase">
            {(
              [
                ["Instagram", event.socials.instagram],
                ["SoundCloud", event.socials.soundcloud],
                ["Resident Advisor", event.socials.residentAdvisor],
                ["Website", event.socials.website],
              ] as const
            )
              .filter(([, url]) => url)
              .map(([label, url]) => (
                <li key={label}>
                  <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-ev-accent">
                    {label} <ArrowDownRight size={13} className="-rotate-90" aria-hidden />
                  </a>
                </li>
              ))}
          </ul>
        </div>
        <div className="mt-12 flex justify-between border-t border-ev-line pt-6 font-ev-mono text-[10px] tracking-[0.18em] text-ev-muted uppercase">
          <span>{event.orgName}</span>
          <Link href="/" className="hover:text-ev-fg">
            Made with EventPage
          </Link>
        </div>
      </footer>
    </div>
  );
}

function SectionLabel({ index, children, className = "" }: { index: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-baseline gap-3 font-ev-mono text-[11px] tracking-[0.18em] uppercase ${className}`}>
      <span className="text-ev-accent">{index}</span>
      <span>{children}</span>
    </div>
  );
}
