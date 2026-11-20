import { ArrowUpRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { createEvent } from "@/app/actions/events";
import { HeroArt } from "@/components/event/hero-art";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { getManagedOrgId } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/session";
import { orgEventSummaries } from "@/lib/dashboard";
import { designVars, THEMES } from "@/lib/events/design";
import { fmt, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Events" };

export default async function DashboardHome() {
  const user = await requireUser("/dashboard");
  const orgId = (await getManagedOrgId(user.id))!;
  const items = await orgEventSummaries(orgId);
  const now = new Date();
  const upcoming = items.filter((i) => i.event.endsAt > now);
  const totals = items.reduce(
    (a, i) => ({ sold: a.sold + i.sold, revenue: a.revenue + i.revenue, currency: i.event.currency }),
    { sold: 0, revenue: 0, currency: "EUR" },
  );
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/Berlin" }).format(now));
  const greeting = hour < 5 ? "Still up" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <main id="main" className="mx-auto max-w-[1400px] px-5 pt-10 pb-24 sm:px-8 sm:pt-16">
      <section className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <span className="label-mono text-muted">{greeting}, {user.name.split(" ")[0]}</span>
          <h1 className="display-serif mt-3 text-[clamp(3.5rem,9vw,7.5rem)] italic">Your nights</h1>
        </div>
        <dl className="grid grid-cols-3 divide-x divide-line rounded-2xl border border-line bg-raised">
          {[
            ["Upcoming", String(upcoming.length)],
            ["Tickets sold", totals.sold.toLocaleString("en-GB")],
            ["Net revenue", formatMoney(totals.revenue, totals.currency)],
          ].map(([k, v]) => (
            <div key={k} className="px-5 py-4 sm:px-7">
              <dt className="label-mono text-muted">{k}</dt>
              <dd className="mt-1.5 text-2xl font-semibold tracking-tight tabular sm:text-3xl">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-14" aria-labelledby="new-h">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 id="new-h" className="label-mono">Start a new event — pick a mood</h2>
        </div>
        <form action={createEvent} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Object.values(THEMES).map((t, i) => (
            <button
              key={t.id}
              name="theme"
              value={t.id}
              style={{ ...designVars({ theme: t.id, typography: t.typography, background: t.background, foreground: t.foreground, accent: t.accent, art: t.art, artSeed: 11 + i * 7, heroImageUrl: null }) }}
              className="group relative aspect-[4/5] overflow-hidden rounded-2xl bg-ev-bg text-left text-ev-fg ring-1 ring-line transition-all duration-500 ease-[var(--ease-out-expo)] hover:-translate-y-1 hover:shadow-[var(--shadow)] focus-visible:-translate-y-1"
            >
              <div className="absolute inset-0 opacity-80 transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:scale-105">
                <HeroArt style={t.art} seed={11 + i * 7} />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--ev-bg)] via-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4">
                <div className="ev-display text-xl [overflow-wrap:anywhere] lg:text-[1.35rem]">{t.name}</div>
                <div className="mt-1 font-ev-mono text-[10px] tracking-[0.12em] text-ev-muted uppercase">{t.mood}</div>
              </div>
              <span className="absolute top-3 right-3 grid h-8 w-8 place-items-center rounded-full bg-ev-accent text-ev-on-accent opacity-0 transition-all duration-300 group-hover:opacity-100">
                <Plus size={16} />
              </span>
            </button>
          ))}
        </form>
      </section>

      <section className="mt-16" aria-labelledby="events-h">
        <h2 id="events-h" className="label-mono mb-4">
          All events <span className="text-muted">· {items.length}</span>
        </h2>
        {items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-line-strong p-14 text-center">
            <p className="display-serif text-4xl italic">Nothing on the calendar yet.</p>
            <p className="mt-3 text-muted">Pick a mood above — you&apos;ll be designing your page in seconds.</p>
          </div>
        ) : (
          <ul className="grid gap-px overflow-hidden rounded-3xl border border-line bg-line">
            {items.map(({ event, sold, capacity, revenue }) => {
              const pct = capacity ? Math.min(100, Math.round((sold / capacity) * 100)) : 0;
              const past = event.endsAt <= now;
              return (
                <li key={event.id} className="bg-raised">
                  <Link
                    href={`/dashboard/events/${event.id}`}
                    className="group grid grid-cols-[72px_1fr] items-center gap-5 p-4 transition-colors hover:bg-surface sm:grid-cols-[96px_1fr_auto] sm:p-5"
                  >
                    <div style={designVars(event.design)} className="relative aspect-square overflow-hidden rounded-xl bg-ev-bg">
                      <HeroArt style={event.design.art} seed={event.design.artSeed} imageUrl={event.design.heroImageUrl} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={event.status} past={past} />
                        <span className="label-mono text-muted">
                          {fmt.weekdayShort(event.startsAt, event.timezone)} {fmt.date(event.startsAt, event.timezone)}
                        </span>
                      </div>
                      <div className="mt-1.5 truncate text-xl font-semibold tracking-tight sm:text-2xl">{event.title}</div>
                      <div className="mt-3 flex items-center gap-3 sm:hidden">
                        <Progress pct={pct} />
                        <span className="label-mono text-muted tabular">{sold}/{capacity}</span>
                      </div>
                    </div>
                    <div className="hidden items-center gap-8 sm:flex">
                      <div className="w-44">
                        <div className="mb-2 flex justify-between label-mono text-muted tabular">
                          <span>{sold} sold</span>
                          <span>{pct}%</span>
                        </div>
                        <Progress pct={pct} />
                      </div>
                      <div className="w-28 text-right text-lg font-semibold tabular">{formatMoney(revenue, event.currency)}</div>
                      <ArrowUpRight size={18} className="text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-fg" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

function Progress({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-fg transition-[width] duration-700" style={{ width: `${pct}%` }} />
    </div>
  );
}
