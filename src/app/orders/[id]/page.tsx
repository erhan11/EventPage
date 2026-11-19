import { and, asc, eq, ne } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { tickets, ticketTypes } from "@/lib/db/schema";
import { designVars } from "@/lib/events/design";
import { getEventWithOrg } from "@/lib/events/queries";
import { TIER_LABEL } from "@/lib/events/view";
import { env } from "@/lib/env";
import { fmt, formatMoney } from "@/lib/format";
import { limitByIp } from "@/lib/security/rate-limit";
import { createTicketToken } from "@/lib/security/ticket-token";
import { findOrderByAccessToken } from "@/lib/tickets/orders";
import { PaymentPoller } from "./poller";

export const metadata: Metadata = {
  title: "Your tickets",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const UUID = /^[0-9a-f-]{36}$/i;

export default async function OrderPage({ params, searchParams }: PageProps<"/orders/[id]">) {
  const { id } = await params;
  const { t } = await searchParams;
  if (!UUID.test(id) || typeof t !== "string" || t.length > 64) notFound();
  if (!(await limitByIp("order-view", 120, 60_000)).ok) notFound();

  const order = await findOrderByAccessToken(id, t);
  if (!order) notFound();
  const ev = await getEventWithOrg({ id: order.eventId });
  if (!ev) notFound();
  const { event, orgName } = ev;
  const tz = event.timezone;

  const rows =
    order.status === "paid" || order.status === "refund_pending" || order.status === "refunded"
      ? await db
          .select({ ticket: tickets, typeName: ticketTypes.name, tier: ticketTypes.tier })
          .from(tickets)
          .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
          .where(and(eq(tickets.orderId, order.id), order.status === "paid" ? ne(tickets.status, "void") : undefined))
          .orderBy(asc(tickets.createdAt), asc(tickets.seq))
      : [];

  const qrs =
    order.status === "paid"
      ? await Promise.all(
          rows.map((r) =>
            QRCode.toString(createTicketToken(r.ticket.id, env.ticketSigningSecret), {
              type: "svg",
              margin: 1,
              errorCorrectionLevel: "M",
              color: { dark: "#0a0a0a", light: "#ffffff" },
            }),
          ),
        )
      : [];

  return (
    <main style={designVars(event.design)} className="@container min-h-svh bg-ev-bg font-ev-body text-ev-fg">
      <div className="mx-auto max-w-xl px-5 py-10">
        <a href={`/e/${event.slug}`} className="font-ev-mono text-[11px] tracking-[0.18em] text-ev-muted uppercase hover:text-ev-fg">
          ← {orgName}
        </a>
        <h1 className="ev-display mt-6 text-[clamp(2.75rem,14cqi,5rem)]">{event.title}</h1>
        <p className="mt-4 font-ev-mono text-xs tracking-[0.14em] text-ev-muted uppercase">
          {fmt.weekday(event.startsAt, tz)} {fmt.date(event.startsAt, tz)} · {fmt.time(event.startsAt, tz)} · {event.venueName}
        </p>

        {order.status === "pending" && <PaymentPoller orderId={order.id} token={t} />}

        {(order.status === "expired" || order.status === "cancelled") && (
          <StatusCard title="Checkout not completed" tone="muted">
            This order {order.status === "expired" ? "expired" : "was cancelled"} before payment was confirmed, so no
            tickets were issued and you have not been charged.{" "}
            <a className="underline" href={`/e/${event.slug}#tickets`}>
              Start again
            </a>
            .
          </StatusCard>
        )}

        {(order.status === "refund_pending" || order.status === "refunded") && (
          <StatusCard title={order.status === "refunded" ? "Refunded" : "Refund in progress"} tone="muted">
            {order.status === "refunded"
              ? "This order was refunded. Its tickets are no longer valid."
              : "We are returning your payment. Your tickets have been cancelled and will not scan at the door."}
          </StatusCard>
        )}

        {order.status === "paid" && (
          <>
            <div className="mt-8 flex items-baseline justify-between border-b border-ev-line pb-3 font-ev-mono text-[11px] tracking-[0.16em] uppercase">
              <span>
                {rows.length} {rows.length === 1 ? "ticket" : "tickets"} · {order.buyerName}
              </span>
              <span className="text-ev-muted">{order.totalCents === 0 ? "Free" : formatMoney(order.totalCents, order.currency)}</span>
            </div>
            <ol className="mt-6 grid gap-6">
              {rows.map((r, i) => (
                <li key={r.ticket.id} className="overflow-hidden rounded-[26px] border border-ev-line bg-ev-surface">
                  <div className="flex items-start justify-between gap-4 p-6">
                    <div>
                      <div className="font-ev-mono text-[10px] tracking-[0.18em] text-ev-accent uppercase">{TIER_LABEL[r.tier]}</div>
                      <div className="mt-1 text-xl font-semibold">{r.typeName}</div>
                    </div>
                    <div className="text-right font-ev-mono text-[10px] tracking-[0.16em] text-ev-muted uppercase">
                      <div>
                        {String(i + 1).padStart(2, "0")} / {String(rows.length).padStart(2, "0")}
                      </div>
                      <div className={r.ticket.status === "checked_in" ? "mt-1 text-ev-accent" : "mt-1"}>
                        {r.ticket.status === "checked_in" ? "Used" : "Valid"}
                      </div>
                    </div>
                  </div>
                  <div className="relative border-t border-dashed border-ev-line px-6 py-7">
                    <span className="absolute -top-3 -left-3 h-6 w-6 rounded-full bg-ev-bg" aria-hidden />
                    <span className="absolute -top-3 -right-3 h-6 w-6 rounded-full bg-ev-bg" aria-hidden />
                    <div
                      className={`mx-auto aspect-square w-full max-w-[280px] rounded-2xl bg-white p-3 [&>svg]:h-full [&>svg]:w-full ${r.ticket.status === "checked_in" ? "opacity-30" : ""}`}
                      role="img"
                      aria-label={`QR code for ticket ${r.ticket.code}`}
                      dangerouslySetInnerHTML={{ __html: qrs[i] }}
                    />
                    <div className="mt-5 text-center font-ev-mono text-sm tracking-[0.3em] tabular">
                      {r.ticket.code.slice(0, 4)}-{r.ticket.code.slice(4)}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-8 text-sm leading-relaxed text-ev-muted">
              Keep this link private — anyone with it can use your tickets. Bookmark it or take a screenshot of each QR
              code. Each code admits one person once.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function StatusCard({ title, children }: { title: string; tone: "muted"; children: React.ReactNode }) {
  return (
    <div role="status" className="mt-10 rounded-3xl border border-ev-line bg-ev-surface p-6">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 leading-relaxed text-ev-muted">{children}</p>
    </div>
  );
}
