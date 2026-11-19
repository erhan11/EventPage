import { ArrowUpRight, PenLine } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { ButtonLink, Card } from "@/components/ui/primitives";
import { canAccessEvent } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/session";
import { eventMetrics, eventOrders, eventStaffList, recentCheckins } from "@/lib/dashboard";
import { getEventWithOrg } from "@/lib/events/queries";
import { TIER_LABEL } from "@/lib/events/view";
import { fmt, formatMoney } from "@/lib/format";
import { OrderActions, PublishControls, StaffPanel } from "./controls";

export const metadata: Metadata = { title: "Event" };

const UUID = /^[0-9a-f-]{36}$/i;

const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  paid: { label: "Paid", cls: "text-ok" },
  pending: { label: "Awaiting payment", cls: "text-warn" },
  expired: { label: "Expired", cls: "text-muted" },
  cancelled: { label: "Cancelled", cls: "text-muted" },
  refund_pending: { label: "Refunding", cls: "text-warn" },
  refunded: { label: "Refunded", cls: "text-muted" },
};

export default async function EventOverview({ params, searchParams }: PageProps<"/dashboard/events/[id]">) {
  const { id } = await params;
  const { q } = await searchParams;
  if (!UUID.test(id)) notFound();
  const user = await requireUser(`/dashboard/events/${id}`);
  if (!(await canAccessEvent(user.id, id, "manage"))) notFound(); // 404, not 403: don't confirm existence
  const row = await getEventWithOrg({ id });
  if (!row) notFound();
  const { event } = row;
  const tz = event.timezone;
  const query = typeof q === "string" ? q : "";

  const [m, orderRows, staff, scans] = await Promise.all([eventMetrics(id), eventOrders(id, query), eventStaffList(id), recentCheckins(id)]);
  const capacity = event.capacity ?? m.types.reduce((s, t) => s + t.capacity, 0);
  const sold = m.types.reduce((s, t) => s + t.sold, 0);
  const held = m.types.reduce((s, t) => s + t.reserved, 0);
  const maxDay = Math.max(1, ...m.series.map((s) => s.tickets));
  const past = event.endsAt <= new Date();

  return (
    <main className="mx-auto max-w-[1400px] px-5 pt-8 pb-24 sm:px-8 sm:pt-12">
      <Link href="/dashboard" className="label-mono text-muted hover:text-fg">
        ← All events
      </Link>

      <header className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={event.status} past={past} />
            <span className="label-mono text-muted">
              {fmt.weekday(event.startsAt, tz)} {fmt.date(event.startsAt, tz)} · {fmt.time(event.startsAt, tz)}–{fmt.time(event.endsAt, tz)} · {event.venueName || "No venue"}
            </span>
          </div>
          <h1 className="mt-3 text-[clamp(2.5rem,6vw,4.75rem)] leading-[0.95] font-semibold tracking-[-0.045em]">{event.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink href={`/dashboard/events/${id}/edit`} variant="secondary">
            <PenLine size={15} /> Edit page
          </ButtonLink>
          {event.status !== "draft" && (
            <ButtonLink href={`/e/${event.slug}`} variant="secondary" target="_blank">
              View live <ArrowUpRight size={15} />
            </ButtonLink>
          )}
          <PublishControls eventId={id} status={event.status} />
        </div>
      </header>

      {/* Metrics */}
      <section className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-line bg-line lg:grid-cols-4" aria-label="Key metrics">
        <Metric label="Net revenue" value={formatMoney(m.orders.revenue, event.currency)} sub={`${m.orders.paid} paid orders${m.orders.refunded ? ` · ${m.orders.refunded} refunded` : ""}`} />
        <Metric label="Tickets sold" value={`${sold}`} sub={`of ${capacity} · ${held} held in checkout`} bar={capacity ? sold / capacity : 0} />
        <Metric label="Checked in" value={`${m.tickets.checkedIn}`} sub={`of ${m.tickets.issued} valid tickets`} bar={m.tickets.issued ? m.tickets.checkedIn / m.tickets.issued : 0} accent />
        <div className="bg-raised p-5 sm:p-6">
          <div className="label-mono text-muted">Last 14 days</div>
          <div className="mt-4 flex h-[72px] items-end gap-[3px]" role="img" aria-label={`Tickets sold per day, last 14 days: ${m.series.map((s) => s.tickets).join(", ")}`}>
            {m.series.map((s) => (
              <div key={s.day} className="group relative flex-1">
                <div className="rounded-[3px] bg-fg/85 transition-colors group-hover:bg-accent" style={{ height: `${Math.max(3, (s.tickets / maxDay) * 72)}px` }} />
                <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 rounded bg-fg px-1.5 py-0.5 text-[10px] whitespace-nowrap text-bg opacity-0 group-hover:opacity-100">
                  {s.tickets}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mt-10 grid gap-10 xl:grid-cols-[1fr_380px]">
        <div className="grid gap-10">
          {/* Inventory */}
          <section aria-labelledby="inv-h">
            <h2 id="inv-h" className="label-mono mb-4">Ticket inventory</h2>
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    {["Ticket", "Price", "Sold", "Held", "Left", "Revenue"].map((h, i) => (
                      <th key={h} className={`label-mono px-5 py-3.5 font-medium text-muted ${i > 0 ? "text-right" : ""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {m.types.map((t) => {
                    const left = t.capacity - t.sold - t.reserved;
                    return (
                      <tr key={t.id} className="border-b border-line last:border-0">
                        <td className="px-5 py-4">
                          <div className="font-medium">{t.name} {!t.isActive && <span className="label-mono ml-1 text-muted">hidden</span>}</div>
                          <div className="mt-1.5 h-1 w-40 overflow-hidden rounded-full bg-surface">
                            <div className="flex h-full">
                              <div className="bg-fg" style={{ width: `${(t.sold / Math.max(1, t.capacity)) * 100}%` }} />
                              <div className="bg-warn/70" style={{ width: `${(t.reserved / Math.max(1, t.capacity)) * 100}%` }} />
                            </div>
                          </div>
                          <div className="label-mono mt-1.5 text-[10px] text-muted">{TIER_LABEL[t.tier]}</div>
                        </td>
                        <td className="px-5 py-4 text-right tabular">{t.priceCents === 0 ? "Free" : formatMoney(t.priceCents, event.currency)}</td>
                        <td className="px-5 py-4 text-right tabular">{t.sold}</td>
                        <td className="px-5 py-4 text-right tabular text-muted">{t.reserved}</td>
                        <td className={`px-5 py-4 text-right tabular ${left === 0 ? "text-danger" : ""}`}>{left === 0 ? "Sold out" : left}</td>
                        <td className="px-5 py-4 text-right font-medium tabular">{formatMoney(t.revenue, event.currency)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </section>

          {/* Attendees */}
          <section aria-labelledby="att-h">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 id="att-h" className="label-mono">
                Orders & attendees <span className="text-muted">· {orderRows.length}{orderRows.length === 100 ? "+" : ""}</span>
              </h2>
              <form className="w-full sm:w-72" role="search">
                <input
                  name="q"
                  defaultValue={query}
                  placeholder="Search name or email"
                  aria-label="Search orders"
                  className="h-10 w-full rounded-full border border-line bg-raised px-4 text-sm outline-none focus:border-fg/40"
                />
              </form>
            </div>
            <Card className="overflow-x-auto">
              {orderRows.length === 0 ? (
                <p className="p-10 text-center text-muted">{query ? "No orders match your search." : "No orders yet. Share your page to start selling."}</p>
              ) : (
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left">
                      {["Buyer", "Tickets", "Total", "Status", "Placed", ""].map((h, i) => (
                        <th key={i} className={`label-mono px-5 py-3.5 font-medium text-muted ${i === 1 || i === 2 ? "text-right" : ""}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orderRows.map(({ order: o, tickets, checkedIn, quantity }) => (
                      <tr key={o.id} className="border-b border-line last:border-0 hover:bg-surface/60">
                        <td className="px-5 py-3.5">
                          <div className="font-medium">{o.buyerName}</div>
                          <div className="text-xs text-muted">{o.buyerEmail}</div>
                        </td>
                        <td className="px-5 py-3.5 text-right tabular">
                          {o.status === "paid" ? tickets : quantity}
                          {checkedIn > 0 && <span className="ml-1.5 text-xs text-ok">({checkedIn} in)</span>}
                        </td>
                        <td className="px-5 py-3.5 text-right tabular">{o.totalCents === 0 ? "Free" : formatMoney(o.totalCents, o.currency)}</td>
                        <td className={`px-5 py-3.5 ${ORDER_STATUS[o.status].cls}`}>
                          <span className="label-mono">{ORDER_STATUS[o.status].label}</span>
                          {o.provider !== "free" && <span className="label-mono ml-2 text-[9px] text-muted">{o.provider === "test_simulator" ? "test" : o.provider}</span>}
                        </td>
                        <td className="px-5 py-3.5 text-muted tabular">{fmt.dateTime(o.createdAt, tz)}</td>
                        <td className="px-5 py-3.5 text-right">{(o.status === "paid" || (o.status === "refund_pending" && o.provider === "stripe")) && (
                            <OrderActions eventId={id} orderId={o.id} buyer={o.buyerName} hasCheckedIn={checkedIn > 0} retry={o.status === "refund_pending"} />
                          )}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </section>
        </div>

        <aside className="grid content-start gap-10">
          <section aria-labelledby="door-h">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="door-h" className="label-mono">Door activity</h2>
              <Link href={`/scan/${id}`} className="label-mono text-muted hover:text-fg">
                Open scanner →
              </Link>
            </div>
            <Card className="p-2">
              {scans.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted">No scans yet.</p>
              ) : (
                <ul>
                  {scans.map((s, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm">
                      <span className="flex items-center gap-2.5">
                        <span className={`h-2 w-2 rounded-full ${s.result === "admitted" ? "bg-ok" : s.result === "already_checked_in" ? "bg-warn" : "bg-danger"}`} />
                        <span className="font-mono text-xs">{s.code ?? "—"}</span>
                        <span className="text-muted">{s.result.replace(/_/g, " ")}</span>
                      </span>
                      <span className="text-xs text-muted tabular">{fmt.time(s.at, tz)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
          <StaffPanel eventId={id} staff={staff} />
        </aside>
      </div>
    </main>
  );
}

function Metric({ label, value, sub, bar, accent }: { label: string; value: string; sub: string; bar?: number; accent?: boolean }) {
  return (
    <div className="bg-raised p-5 sm:p-6">
      <div className="label-mono text-muted">{label}</div>
      <div className="mt-2 text-[clamp(1.75rem,3.2vw,2.75rem)] leading-none font-semibold tracking-[-0.04em] tabular">{value}</div>
      {bar !== undefined && (
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-surface">
          <div className={`h-full rounded-full ${accent ? "bg-accent" : "bg-fg"}`} style={{ width: `${Math.min(100, bar * 100)}%` }} />
        </div>
      )}
      <div className="mt-3 text-xs text-muted">{sub}</div>
    </div>
  );
}
