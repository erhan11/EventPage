"use client";

import { ArrowDown, ArrowUp, Eye, EyeOff, ImageUp, Loader2, Plus, Shuffle, Trash2, TriangleAlert } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { deleteTicketType, saveTicketType } from "@/app/actions/events";
import { HeroArt } from "@/components/event/hero-art";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { contrastRatio, designVars, isHex, THEMES, TYPOGRAPHY } from "@/lib/events/design";
import type { ArtStyle, EventDesign, LineupEntry, ScheduleEntry, SocialLinks } from "@/lib/events/types";
import type { EventDraft, TicketTypeInput } from "@/lib/events/validation";
import { TIER_LABEL } from "@/lib/events/view";
import { formatPrice, slugify } from "@/lib/format";

type Update = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => void;
const newId = () => Math.random().toString(36).slice(2, 10);

function PanelTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-semibold tracking-tight">{children}</h2>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}

const TIMEZONES = [
  "Europe/Berlin", "Europe/London", "Europe/Amsterdam", "Europe/Paris", "Europe/Madrid", "Europe/Lisbon", "Europe/Rome",
  "Europe/Athens", "Europe/Istanbul", "Europe/Stockholm", "Europe/Warsaw", "Europe/Prague", "Europe/Zurich",
  "America/New_York", "America/Chicago", "America/Los_Angeles", "America/Mexico_City", "America/Sao_Paulo",
  "Asia/Dubai", "Asia/Bangkok", "Asia/Tokyo", "Asia/Singapore", "Australia/Sydney", "Africa/Cape_Town", "UTC",
];

/* ───────────────────────── Content ───────────────────────── */

export function ContentPanel({ draft, update }: { draft: EventDraft; update: Update }) {
  const [slugTouched, setSlugTouched] = useState(false);
  // Moving the start keeps the night's length — the end shifts along instead of erroring.
  const moveStart = (start: string) => {
    const prevStart = new Date(draft.startsLocal).getTime();
    const prevEnd = new Date(draft.endsLocal).getTime();
    update("startsLocal", start);
    if (draft.endsLocal > start) return;
    const duration = prevEnd > prevStart ? prevEnd - prevStart : 8 * 36e5;
    const end = new Date(new Date(start).getTime() + duration);
    const pad = (n: number) => String(n).padStart(2, "0");
    update("endsLocal", `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}`);
  };
  return (
    <div className="grid gap-5">
      <PanelTitle hint="The essentials people see first.">Event</PanelTitle>
      <Field label="Event name">
        <Input
          value={draft.title}
          maxLength={80}
          onChange={(e) => update("title", e.target.value)}
          // First real name replaces the auto-generated URL, unless the URL was edited by hand.
          onBlur={() => {
            if (!slugTouched && draft.slug.startsWith("untitled-night") && draft.title.trim() && draft.title !== "Untitled Night")
              update("slug", slugify(draft.title) || draft.slug);
          }}
        />
      </Field>
      <Field label="Page URL" hint={`eventpage.app/e/${draft.slug}`}>
        <Input
          value={draft.slug}
          maxLength={48}
          onChange={(e) => {
            setSlugTouched(true);
            update("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
          }}
        />
      </Field>
      <Field label="Tagline" hint={`${draft.tagline.length}/160`}>
        <Input value={draft.tagline} maxLength={160} placeholder="Eight hours of hypnotic techno under the Spree bridges." onChange={(e) => update("tagline", e.target.value)} />
      </Field>
      <Field label="Description" hint="Blank line = new paragraph. The first paragraph gets a drop cap.">
        <Textarea rows={8} value={draft.description} maxLength={4000} onChange={(e) => update("description", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts">
          <Input type="datetime-local" value={draft.startsLocal} onChange={(e) => e.target.value && moveStart(e.target.value)} />
        </Field>
        <Field label="Ends">
          <Input type="datetime-local" min={draft.startsLocal} value={draft.endsLocal} onChange={(e) => e.target.value && update("endsLocal", e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Timezone">
          <Select value={draft.timezone} onChange={(e) => update("timezone", e.target.value)}>
            {(TIMEZONES.includes(draft.timezone) ? TIMEZONES : [draft.timezone, ...TIMEZONES]).map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Currency">
          <Select value={draft.currency} onChange={(e) => update("currency", e.target.value as EventDraft["currency"])}>
            {["EUR", "GBP", "USD", "CHF", "SEK", "DKK", "NOK", "PLN", "CZK", "TRY", "AUD", "CAD"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Venue capacity (optional)" hint="Hard cap across all ticket types.">
        <Input
          type="number"
          min={1}
          inputMode="numeric"
          value={draft.capacity ?? ""}
          onChange={(e) => update("capacity", e.target.value ? Math.max(1, Math.floor(Number(e.target.value))) : null)}
        />
      </Field>
    </div>
  );
}

/* ───────────────────────── Design ───────────────────────── */

const ART: { id: ArtStyle; label: string }[] = [
  { id: "waves", label: "Waves" },
  { id: "orbit", label: "Sun" },
  { id: "mesh", label: "Haze" },
  { id: "grid", label: "Grid" },
];

export function DesignPanel({ eventId, design, onChange }: { eventId: string; design: EventDesign; onChange: (d: EventDesign) => void }) {
  const set = <K extends keyof EventDesign>(k: K, v: EventDesign[K]) => onChange({ ...design, [k]: v });
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const contrast = contrastRatio(design.background, design.foreground);

  async function upload(file: File) {
    setUploadError(null);
    if (file.size > 6 * 1024 * 1024) return setUploadError("Image must be under 6 MB.");
    setUploading(true);
    const fd = new FormData();
    fd.set("eventId", eventId);
    fd.set("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      onChange({ ...design, heroImageUrl: json.url, art: "image" });
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid gap-8">
      <div>
        <PanelTitle hint="Each theme sets colour, type and artwork. Fine-tune below.">Theme</PanelTitle>
        <div className="grid grid-cols-2 gap-2.5">
          {Object.values(THEMES).map((t) => {
            const active = design.theme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onChange({ ...design, theme: t.id, background: t.background, foreground: t.foreground, accent: t.accent, typography: t.typography, art: design.art === "image" && design.heroImageUrl ? "image" : t.art })}
                aria-pressed={active}
                style={designVars({ ...design, theme: t.id, background: t.background, foreground: t.foreground, accent: t.accent, typography: t.typography })}
                className={`relative h-24 overflow-hidden rounded-2xl bg-ev-bg p-3 text-left text-ev-fg transition-all ${active ? "ring-2 ring-fg ring-offset-2 ring-offset-bg" : "ring-1 ring-line hover:-translate-y-0.5"}`}
              >
                <div className="absolute inset-0 opacity-60">
                  <HeroArt style={t.art} seed={design.artSeed} />
                </div>
                <div className="relative ev-display text-xl">{t.name}</div>
                <div className="absolute right-3 bottom-3 h-4 w-4 rounded-full bg-ev-accent" />
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="label-mono mb-3">Hero artwork</h3>
        <div className="grid grid-cols-4 gap-2">
          {ART.map((a) => (
            <button
              key={a.id}
              aria-pressed={design.art === a.id}
              onClick={() => set("art", a.id)}
              style={designVars(design)}
              className={`relative aspect-square overflow-hidden rounded-xl bg-ev-bg ${design.art === a.id ? "ring-2 ring-fg ring-offset-2 ring-offset-bg" : "ring-1 ring-line"}`}
            >
              <HeroArt style={a.id} seed={design.artSeed} />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 px-2 py-1 text-[11px] text-white">{a.label}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" className="h-9" onClick={() => onChange({ ...design, artSeed: Math.floor(Math.random() * 1_000_000), art: design.art === "image" ? "waves" : design.art })}>
            <Shuffle size={14} /> Shuffle
          </Button>
          <Button variant="secondary" className="h-9" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImageUp size={14} />} Upload image
          </Button>
          {design.heroImageUrl && (
            <Button variant={design.art === "image" ? "primary" : "ghost"} className="h-9" onClick={() => set("art", "image")}>
              Use uploaded
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }}
          />
        </div>
        {uploadError && <p className="mt-2 text-sm text-danger">{uploadError}</p>}
      </div>

      <div>
        <h3 className="label-mono mb-3">Colours</h3>
        <div className="grid gap-2.5">
          {(
            [
              ["background", "Background"],
              ["foreground", "Text"],
              ["accent", "Accent"],
            ] as const
          ).map(([k, label]) => (
            <ColorRow key={k} label={label} value={design[k]} onChange={(v) => set(k, v)} />
          ))}
        </div>
        {contrast < 4.5 && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">
            <TriangleAlert size={15} className="mt-0.5 shrink-0" /> Text contrast is {contrast.toFixed(1)}:1 — aim for at least 4.5:1 so everyone can read your page.
          </p>
        )}
      </div>

      <div>
        <h3 className="label-mono mb-3">Typography</h3>
        <div className="grid gap-2">
          {Object.values(TYPOGRAPHY).map((t) => (
            <button
              key={t.id}
              aria-pressed={design.typography === t.id}
              onClick={() => set("typography", t.id)}
              style={designVars({ ...design, typography: t.id })}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${design.typography === t.id ? "border-fg bg-surface" : "border-line hover:border-line-strong"}`}
            >
              <span className="ev-display text-2xl leading-none">Nightfall</span>
              <span className="label-mono text-muted">{t.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setText(value);
  }
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-raised p-1.5 pr-3">
      <label className="relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-lg ring-1 ring-line" style={{ background: value }}>
        <span className="sr-only">{label} colour picker</span>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
      <span className="flex-1 text-sm">{label}</span>
      <input
        aria-label={`${label} hex value`}
        value={text}
        maxLength={7}
        onChange={(e) => {
          setText(e.target.value);
          if (isHex(e.target.value)) onChange(e.target.value.toLowerCase());
        }}
        className="w-20 bg-transparent text-right font-mono text-sm uppercase outline-none"
      />
    </div>
  );
}

/* ───────────────────────── Lineup ───────────────────────── */

function move<T>(arr: T[], i: number, dir: -1 | 1) {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function LineupPanel({ lineup, onChange }: { lineup: LineupEntry[]; onChange: (l: LineupEntry[]) => void }) {
  const set = (i: number, patch: Partial<LineupEntry>) => onChange(lineup.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div className="grid gap-4">
      <PanelTitle hint="Top of the list = biggest billing. Names also run in the marquee.">Lineup</PanelTitle>
      {lineup.map((l, i) => (
        <div key={l.id} className="rounded-2xl border border-line bg-raised p-3">
          <div className="flex items-center gap-2">
            <span className="w-6 text-center font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
            <Input aria-label="Artist name" placeholder="Artist name" value={l.name} maxLength={60} onChange={(e) => set(i, { name: e.target.value })} className="h-10 font-medium" />
            <RowControls onUp={() => onChange(move(lineup, i, -1))} onDown={() => onChange(move(lineup, i, 1))} onRemove={() => onChange(lineup.filter((_, j) => j !== i))} label={l.name || "artist"} />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 pl-8">
            <Input aria-label="Billing" placeholder="Headliner" value={l.billing} maxLength={40} onChange={(e) => set(i, { billing: e.target.value })} className="h-9 text-sm" />
            <Input aria-label="Genre" placeholder="Techno" value={l.genre} maxLength={40} onChange={(e) => set(i, { genre: e.target.value })} className="h-9 text-sm" />
            <Input aria-label="Set time" placeholder="02:00" value={l.time} maxLength={20} onChange={(e) => set(i, { time: e.target.value })} className="h-9 text-sm" />
          </div>
        </div>
      ))}
      <Button variant="secondary" disabled={lineup.length >= 40} onClick={() => onChange([...lineup, { id: newId(), name: "", billing: "", genre: "", time: "" }])}>
        <Plus size={15} /> Add artist
      </Button>
    </div>
  );
}

function RowControls({ onUp, onDown, onRemove, label }: { onUp: () => void; onDown: () => void; onRemove: () => void; label: string }) {
  const cls = "grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-fg";
  return (
    <div className="flex">
      <button className={cls} onClick={onUp} aria-label={`Move ${label} up`}>
        <ArrowUp size={14} />
      </button>
      <button className={cls} onClick={onDown} aria-label={`Move ${label} down`}>
        <ArrowDown size={14} />
      </button>
      <button className={`${cls} hover:text-danger`} onClick={onRemove} aria-label={`Remove ${label}`}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}

/* ───────────────────────── Schedule ───────────────────────── */

export function SchedulePanel({ schedule, onChange }: { schedule: ScheduleEntry[]; onChange: (s: ScheduleEntry[]) => void }) {
  const set = (i: number, patch: Partial<ScheduleEntry>) => onChange(schedule.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <div className="grid gap-3">
      <PanelTitle hint="Doors, set changes, last entry, close.">Running order</PanelTitle>
      {schedule.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2">
          <Input aria-label="Time" value={s.time} maxLength={20} placeholder="23:00" onChange={(e) => set(i, { time: e.target.value })} className="w-24 font-mono" />
          <Input aria-label="What happens" value={s.label} maxLength={80} placeholder="Doors open" onChange={(e) => set(i, { label: e.target.value })} />
          <RowControls onUp={() => onChange(move(schedule, i, -1))} onDown={() => onChange(move(schedule, i, 1))} onRemove={() => onChange(schedule.filter((_, j) => j !== i))} label={s.label || "item"} />
        </div>
      ))}
      <Button variant="secondary" disabled={schedule.length >= 30} onClick={() => onChange([...schedule, { id: newId(), time: "", label: "" }])}>
        <Plus size={15} /> Add moment
      </Button>
    </div>
  );
}

/* ───────────────────────── Venue ───────────────────────── */

export function VenuePanel({ draft, update }: { draft: EventDraft; update: Update }) {
  return (
    <div className="grid gap-5">
      <PanelTitle hint="Shown on the page with a map link. Keep secret locations vague until you're ready.">Venue</PanelTitle>
      <Field label="Venue name">
        <Input value={draft.venueName} maxLength={100} placeholder="Kraftwerk Halle" onChange={(e) => update("venueName", e.target.value)} />
      </Field>
      <Field label="Street address">
        <Input value={draft.venueAddress} maxLength={200} placeholder="Köpenicker Str. 70" onChange={(e) => update("venueAddress", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="City">
          <Input value={draft.city} maxLength={80} onChange={(e) => update("city", e.target.value)} />
        </Field>
        <Field label="Country">
          <Input value={draft.country} maxLength={80} onChange={(e) => update("country", e.target.value)} />
        </Field>
      </div>
    </div>
  );
}

/* ───────────────────────── Links ───────────────────────── */

export function LinksPanel({ socials, onChange }: { socials: SocialLinks; onChange: (s: SocialLinks) => void }) {
  const fields: [keyof SocialLinks, string, string][] = [
    ["instagram", "Instagram", "https://instagram.com/…"],
    ["soundcloud", "SoundCloud", "https://soundcloud.com/…"],
    ["residentAdvisor", "Resident Advisor", "https://ra.co/…"],
    ["website", "Website", "https://…"],
  ];
  return (
    <div className="grid gap-5">
      <PanelTitle hint="Only https:// links are allowed.">Links</PanelTitle>
      {fields.map(([k, label, ph]) => {
        const v = socials[k] ?? "";
        const bad = v !== "" && !/^https:\/\/\S+$/i.test(v);
        return (
          <Field key={k} label={label} error={bad ? "Must start with https://" : undefined}>
            <Input type="url" value={v} placeholder={ph} maxLength={300} onChange={(e) => onChange({ ...socials, [k]: e.target.value })} />
          </Field>
        );
      })}
    </div>
  );
}

/* ───────────────────────── Tickets ───────────────────────── */

export type EditableTicket = TicketTypeInput & { sold: number; reserved: number };

const blankTicket = (): EditableTicket => ({
  name: "General Admission",
  description: "",
  tier: "general",
  priceCents: 2000,
  capacity: 100,
  maxPerOrder: 10,
  salesStartLocal: "",
  salesEndLocal: "",
  isActive: true,
  sold: 0,
  reserved: 0,
});

export function TicketsPanel({
  eventId,
  currency,
  types,
  setTypes,
  paymentsReady,
}: {
  eventId: string;
  currency: string;
  types: EditableTicket[];
  setTypes: React.Dispatch<React.SetStateAction<EditableTicket[]>>;
  paymentsReady: boolean;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  return (
    <div className="grid gap-3">
      <PanelTitle hint="Ticket changes save when you press Save — prices never change for tickets already sold.">Tickets</PanelTitle>
      {!paymentsReady && types.some((t) => t.priceCents > 0 && t.tier !== "free") && (
        <p className="flex items-start gap-2 rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" /> Payments aren&apos;t connected. Add Stripe keys to sell paid tickets — free tickets work now.
        </p>
      )}
      {types.map((t, i) =>
        editing === i ? (
          <TicketForm
            key={t.id ?? `new-${i}`}
            eventId={eventId}
            currency={currency}
            ticket={t}
            onSaved={(saved) => {
              setTypes((all) => all.map((x, j) => (j === i ? saved : x)));
              setEditing(null);
            }}
            onCancel={() => {
              if (!t.id) setTypes((all) => all.filter((_, j) => j !== i));
              setEditing(null);
            }}
            onDeleted={() => {
              setTypes((all) => all.filter((_, j) => j !== i));
              setEditing(null);
            }}
          />
        ) : (
          <button
            key={t.id ?? i}
            onClick={() => setEditing(i)}
            className={`flex items-center justify-between gap-3 rounded-2xl border border-line bg-raised p-4 text-left transition-colors hover:border-line-strong ${t.isActive ? "" : "opacity-55"}`}
          >
            <div className="min-w-0">
              <div className="label-mono text-[10px] text-muted">{TIER_LABEL[t.tier]}{t.isActive ? "" : " · hidden"}</div>
              <div className="mt-1 truncate font-medium">{t.name}</div>
              <div className="mt-1 text-xs text-muted tabular">
                {t.sold} sold · {t.reserved} held · {t.capacity} capacity
              </div>
            </div>
            <div className="text-lg font-semibold tabular">{formatPrice(t.tier === "free" ? 0 : t.priceCents, currency)}</div>
          </button>
        ),
      )}
      <Button
        variant="secondary"
        disabled={editing !== null || types.length >= 12}
        onClick={() => {
          setTypes((all) => [...all, blankTicket()]);
          setEditing(types.length);
        }}
      >
        <Plus size={15} /> Add ticket type
      </Button>
    </div>
  );
}

function TicketForm({
  eventId,
  currency,
  ticket,
  onSaved,
  onCancel,
  onDeleted,
}: {
  eventId: string;
  currency: string;
  ticket: EditableTicket;
  onSaved: (t: EditableTicket) => void;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [t, setT] = useState(ticket);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof EditableTicket>(k: K, v: EditableTicket[K]) => setT((x) => ({ ...x, [k]: v }));
  const minCapacity = t.sold + t.reserved;

  return (
    <form
      className="grid gap-4 rounded-2xl border border-fg/30 bg-raised p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const { sold, reserved, ...input } = t;
          const r = await saveTicketType(eventId, input);
          if (r.ok) onSaved({ ...t, id: r.id, sold, reserved, priceCents: t.tier === "free" ? 0 : t.priceCents });
          else setError(r.error);
        });
      }}
    >
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label="Name">
          <Input value={t.name} maxLength={60} required onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Tier">
          <Select value={t.tier} onChange={(e) => set("tier", e.target.value as EditableTicket["tier"])}>
            {Object.entries(TIER_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Description (optional)">
        <Input value={t.description} maxLength={200} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label={`Price (${currency})`}>
          <Input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            disabled={t.tier === "free"}
            value={t.tier === "free" ? 0 : t.priceCents / 100}
            onChange={(e) => set("priceCents", Math.max(0, Math.round(Number(e.target.value) * 100)))}
          />
        </Field>
        <Field label="Capacity" error={t.capacity < minCapacity ? `Min ${minCapacity}` : undefined}>
          <Input type="number" min={minCapacity} inputMode="numeric" value={t.capacity} onChange={(e) => set("capacity", Math.max(0, Math.floor(Number(e.target.value))))} />
        </Field>
        <Field label="Max / order">
          <Input type="number" min={1} max={20} inputMode="numeric" value={t.maxPerOrder} onChange={(e) => set("maxPerOrder", Math.min(20, Math.max(1, Math.floor(Number(e.target.value)))))} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sales open (optional)">
          <Input type="datetime-local" value={t.salesStartLocal} onChange={(e) => set("salesStartLocal", e.target.value)} />
        </Field>
        <Field label="Sales close (optional)">
          <Input type="datetime-local" value={t.salesEndLocal} onChange={(e) => set("salesEndLocal", e.target.value)} />
        </Field>
      </div>
      <button type="button" onClick={() => set("isActive", !t.isActive)} className="flex items-center gap-2 text-sm text-muted hover:text-fg">
        {t.isActive ? <Eye size={15} /> : <EyeOff size={15} />} {t.isActive ? "Visible on page" : "Hidden from page"}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        {t.id ? (
          <Button
            type="button"
            variant="danger"
            className="h-9"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await deleteTicketType(eventId, t.id!);
                if (r.ok) onDeleted();
                else setError(r.error);
              })
            }
          >
            <Trash2 size={14} /> Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="h-9" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" className="h-9" disabled={pending}>
            {pending ? "Saving…" : "Save ticket"}
          </Button>
        </div>
      </div>
    </form>
  );
}
