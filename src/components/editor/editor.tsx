"use client";

import { ArrowLeft, Calendar, Check, ExternalLink, Link2, ListMusic, Loader2, MapPin, Monitor, Palette, Smartphone, Ticket, TriangleAlert, Type } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveEventDraft, setEventStatus } from "@/app/actions/events";
import { EventView } from "@/components/event/event-view";
import type { EventDraft } from "@/lib/events/validation";
import { availabilityOf, type EventViewModel } from "@/lib/events/view";
import { zonedLocalToUtc } from "@/lib/format";
import { ContentPanel, DesignPanel, LineupPanel, LinksPanel, SchedulePanel, TicketsPanel, VenuePanel, type EditableTicket } from "./panels";

const TABS = [
  { id: "content", label: "Content", icon: Type },
  { id: "design", label: "Design", icon: Palette },
  { id: "lineup", label: "Lineup", icon: ListMusic },
  { id: "schedule", label: "Schedule", icon: Calendar },
  { id: "venue", label: "Venue", icon: MapPin },
  { id: "tickets", label: "Tickets", icon: Ticket },
  { id: "links", label: "Links", icon: Link2 },
] as const;
type TabId = (typeof TABS)[number]["id"];

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: string } | { kind: "error"; message: string };

function safeUtc(local: string, tz: string) {
  try {
    return zonedLocalToUtc(local, tz).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

export function Editor({
  eventId,
  orgName,
  status: initialStatus,
  paymentsReady,
  initial,
  initialTypes,
}: {
  eventId: string;
  orgName: string;
  status: "draft" | "published" | "cancelled";
  paymentsReady: boolean;
  initial: EventDraft;
  initialTypes: EditableTicket[];
}) {
  const [draft, setDraft] = useState<EventDraft>(initial);
  const [types, setTypes] = useState<EditableTicket[]>(initialTypes);
  const [tab, setTab] = useState<TabId>("content");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [status, setStatus] = useState(initialStatus);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishing, startPublish] = useTransition();
  const first = useRef(true);
  const latest = useRef(draft);
  useEffect(() => {
    latest.current = draft;
  }, [draft]);

  const update = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  // Debounced autosave.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSave({ kind: "saving" });
    const handle = setTimeout(async () => {
      const snapshot = latest.current;
      try {
        const r = await saveEventDraft(eventId, snapshot);
        if (latest.current !== snapshot) return; // newer edit pending
        setSave(r.ok ? { kind: "saved", at: r.savedAt } : { kind: "error", message: r.error });
      } catch {
        setSave({ kind: "error", message: "Couldn't reach the server — retrying on next change." });
      }
    }, 700);
    return () => clearTimeout(handle);
  }, [draft, eventId]);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (save.kind === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [save.kind]);

  const preview: EventViewModel = useMemo(
    () => ({
      id: eventId,
      slug: draft.slug,
      orgName,
      title: draft.title,
      tagline: draft.tagline,
      description: draft.description,
      startsAt: safeUtc(draft.startsLocal, draft.timezone),
      endsAt: safeUtc(draft.endsLocal, draft.timezone),
      timezone: draft.timezone,
      venueName: draft.venueName,
      venueAddress: draft.venueAddress,
      city: draft.city,
      country: draft.country,
      currency: draft.currency,
      design: draft.design,
      lineup: draft.lineup,
      schedule: draft.schedule,
      socials: draft.socials,
      status,
      tickets: types
        .filter((t) => t.id && t.isActive)
        .map((t) => ({
          id: t.id!,
          name: t.name,
          description: t.description,
          tier: t.tier,
          priceCents: t.tier === "free" ? 0 : t.priceCents,
          maxPerOrder: t.maxPerOrder,
          availability: availabilityOf({
            capacity: t.capacity,
            sold: t.sold,
            reserved: t.reserved,
            salesStartAt: t.salesStartLocal ? new Date(safeUtc(t.salesStartLocal, draft.timezone)) : null,
            salesEndAt: t.salesEndLocal ? new Date(safeUtc(t.salesEndLocal, draft.timezone)) : null,
          }),
          salesStartAt: null,
        })),
    }),
    [draft, types, eventId, orgName, status],
  );

  const publish = () =>
    startPublish(async () => {
      setPublishError(null);
      const r = await saveEventDraft(eventId, latest.current);
      if (!r.ok) return setPublishError(r.error);
      const p = await setEventStatus(eventId, "published");
      if (p.ok) setStatus("published");
      else setPublishError(p.error);
    });

  return (
    <div className="flex h-[calc(100svh-4rem)] flex-col">
      {/* Editor toolbar */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={`/dashboard/events/${eventId}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-surface" aria-label="Back to event overview">
            <ArrowLeft size={16} />
          </Link>
          <span className="truncate font-medium tracking-tight">{draft.title || "Untitled"}</span>
          <SaveIndicator state={save} />
        </div>
        <div className="flex items-center gap-2">
          <div role="radiogroup" aria-label="Preview device" className="hidden rounded-full border border-line p-0.5 md:flex">
            {(
              [
                ["desktop", Monitor],
                ["phone", Smartphone],
              ] as const
            ).map(([d, Icon]) => (
              <button
                key={d}
                role="radio"
                aria-checked={device === d}
                aria-label={`${d} preview`}
                onClick={() => setDevice(d)}
                className={`grid h-8 w-9 place-items-center rounded-full transition-colors ${device === d ? "bg-fg text-bg" : "text-muted hover:text-fg"}`}
              >
                <Icon size={15} />
              </button>
            ))}
          </div>
          {status === "published" ? (
            <a href={`/e/${draft.slug}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong px-4 text-sm hover:border-fg/40">
              <span className="h-1.5 w-1.5 rounded-full bg-ok" /> Live <ExternalLink size={13} />
            </a>
          ) : (
            <button
              onClick={publish}
              disabled={publishing || status === "cancelled"}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold text-accent-ink transition hover:brightness-95 disabled:opacity-50"
            >
              {publishing ? <Loader2 size={14} className="animate-spin" /> : null} Publish
            </button>
          )}
        </div>
      </div>
      {publishError && (
        <div role="alert" className="flex items-center gap-2 border-b border-danger/30 bg-danger/8 px-6 py-2.5 text-sm text-danger">
          <TriangleAlert size={15} /> {publishError}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Controls */}
        <aside className="flex min-h-0 flex-col border-line md:w-[420px] md:shrink-0 md:border-r">
          <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-3 py-2" aria-label="Editor sections" role="tablist">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                aria-controls={`panel-${id}`}
                onClick={() => setTab(id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] transition-colors ${tab === id ? "bg-fg text-bg" : "text-muted hover:bg-surface hover:text-fg"}`}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </nav>
          <div id={`panel-${tab}`} role="tabpanel" className="max-h-[45svh] flex-1 overflow-y-auto px-5 py-6 md:max-h-none">
            {tab === "content" && <ContentPanel draft={draft} update={update} />}
            {tab === "design" && <DesignPanel eventId={eventId} design={draft.design} onChange={(d) => update("design", d)} />}
            {tab === "lineup" && <LineupPanel lineup={draft.lineup} onChange={(l) => update("lineup", l)} />}
            {tab === "schedule" && <SchedulePanel schedule={draft.schedule} onChange={(s) => update("schedule", s)} />}
            {tab === "venue" && <VenuePanel draft={draft} update={update} />}
            {tab === "tickets" && <TicketsPanel eventId={eventId} currency={draft.currency} types={types} setTypes={setTypes} paymentsReady={paymentsReady} />}
            {tab === "links" && <LinksPanel socials={draft.socials} onChange={(s) => update("socials", s)} />}
          </div>
        </aside>

        {/* Live preview */}
        <section className="relative min-h-0 flex-1 overflow-hidden bg-surface" aria-label="Live preview">
          <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-raised/90 px-3 py-1 label-mono text-[10px] text-muted shadow-[var(--shadow)] backdrop-blur">
            Live preview
          </div>
          <div className="flex h-full items-start justify-center overflow-hidden p-3 md:p-6">
            <div
              className={`h-full overflow-y-auto overscroll-contain bg-black shadow-[0_40px_80px_-40px_rgba(0,0,0,0.5)] ring-1 ring-black/10 transition-[width,border-radius] duration-500 ease-[var(--ease-out-expo)] ${
                device === "phone" ? "w-[390px] max-w-full rounded-[44px] border-[10px] border-[#111]" : "w-full max-w-[1280px] rounded-2xl"
              }`}
            >
              <EventView event={preview} mode="preview" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const base = "hidden sm:inline-flex items-center gap-1.5 label-mono text-[10px]";
  if (state.kind === "saving")
    return (
      <span className={`${base} text-muted`} aria-live="polite">
        <Loader2 size={11} className="animate-spin" /> Saving
      </span>
    );
  if (state.kind === "saved")
    return (
      <span className={`${base} text-muted`} aria-live="polite">
        <Check size={11} /> Saved
      </span>
    );
  if (state.kind === "error")
    return (
      <span className={`${base} max-w-[40ch] truncate text-danger`} role="alert" title={state.message}>
        <TriangleAlert size={11} /> {state.message}
      </span>
    );
  return null;
}
