import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { activePaidProvider } from "@/lib/payments/provider";
import { findOrderByAccessToken } from "@/lib/tickets/orders";
import { simulateGateway } from "./actions";
import { GatewayButtons } from "./buttons";

export const metadata: Metadata = { title: "Test payment gateway", robots: { index: false }, referrer: "no-referrer" };

/**
 * A stand-in for a hosted payment page (like Stripe Checkout) for local development.
 * It never touches the database directly: it delivers a signed webhook, and only the
 * webhook endpoint — after verifying the signature — can issue tickets.
 */
export default async function TestGateway({ params, searchParams }: PageProps<"/test-gateway/[orderId]">) {
  if (env.isProduction || activePaidProvider() !== "test_simulator") notFound();
  const { orderId } = await params;
  const { t } = await searchParams;
  if (typeof t !== "string" || t.length > 64 || !/^[0-9a-f-]{36}$/i.test(orderId)) notFound();
  const order = await findOrderByAccessToken(orderId, t);
  if (!order) notFound();
  const [event] = await db.select({ title: events.title, slug: events.slug }).from(events).where(eq(events.id, order.eventId));

  return (
    <main className="grid min-h-svh place-items-center bg-[#eef0f4] p-5 text-[#1a1f36] dark:bg-[#0f1117] dark:text-[#e6e8ef]">
      <div className="w-full max-w-md">
        <div className="mb-4 flex items-center justify-between rounded-xl border-2 border-dashed border-amber-500/70 bg-amber-100 px-4 py-2.5 text-[13px] font-medium text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
          <span>TEST MODE — local payment simulator</span>
          <span className="font-mono text-[11px]">no real money</span>
        </div>
        <div className="rounded-2xl bg-white p-7 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.35)] dark:bg-[#171a23]">
          <div className="text-sm opacity-60">Pay {event?.title}</div>
          <div className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">{formatMoney(order.totalCents, order.currency)}</div>

          {order.status !== "pending" ? (
            <p className="mt-6 rounded-lg bg-black/5 p-4 text-sm dark:bg-white/5">
              This checkout is <b>{order.status}</b>.{" "}
              <a className="underline" href={`/orders/${order.id}?t=${encodeURIComponent(t)}`}>
                View order
              </a>
            </p>
          ) : (
            <form action={simulateGateway} className="mt-7 grid gap-4">
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="t" value={t} />
              <div className="grid gap-1.5 text-sm">
                <span className="opacity-70">Email</span>
                <div className="rounded-lg border border-black/10 px-3 py-2.5 dark:border-white/10">{order.buyerEmail}</div>
              </div>
              <div className="grid gap-1.5 text-sm">
                <span className="opacity-70">Card (simulated)</span>
                <div className="flex justify-between rounded-lg border border-black/10 px-3 py-2.5 font-mono dark:border-white/10">
                  <span>•••• •••• •••• 4242</span>
                  <span className="opacity-60">12/34</span>
                </div>
              </div>
              <GatewayButtons amount={formatMoney(order.totalCents, order.currency)} />
              <a href={`/e/${event?.slug}?checkout=cancelled`} className="text-center text-sm opacity-60 hover:opacity-100">
                ← Back to event
              </a>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
