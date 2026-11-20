"use client";

import { Lock, Minus, Plus } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { startCheckout, type CheckoutState } from "@/app/actions/checkout";
import { TIER_LABEL, type TicketOption } from "@/lib/events/view";
import { fmt, formatMoney, formatPrice } from "@/lib/format";

function availabilityLabel(o: TicketOption, tz: string): string | null {
  switch (o.availability) {
    case "low":
      return "Final release";
    case "sold_out":
      return "Sold out";
    case "ended":
      return "Sales ended";
    case "not_started":
      return o.salesStartAt ? `Opens ${fmt.date(o.salesStartAt, tz)}` : "Coming soon";
    default:
      return null;
  }
}

export function TicketSelector({
  eventId,
  slug,
  currency,
  timezone,
  options,
  disabled,
  disabledReason,
  testMode,
}: {
  eventId: string;
  slug: string;
  currency: string;
  timezone: string;
  options: TicketOption[];
  disabled: boolean;
  disabledReason: string;
  testMode: boolean;
  dark: boolean;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [state, action, pending] = useActionState<CheckoutState, FormData>(startCheckout, null);

  const lines = useMemo(
    () => options.filter((o) => (qty[o.id] ?? 0) > 0).map((o) => ({ ticketTypeId: o.id, quantity: qty[o.id] })),
    [options, qty],
  );
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  const total = options.reduce((s, o) => s + (qty[o.id] ?? 0) * o.priceCents, 0);

  const set = (id: string, n: number, max: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(max, n)) }));

  if (options.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-ev-line p-10 text-center font-ev-mono text-xs tracking-[0.16em] text-ev-muted uppercase">
        Tickets will be announced soon
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-8 @4xl:grid-cols-[1fr_22rem] @4xl:items-start">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />

      <ul className="grid gap-4">
        {options.map((o) => {
          const n = qty[o.id] ?? 0;
          const buyable = o.availability === "available" || o.availability === "low";
          const vip = o.tier === "vip";
          const label = availabilityLabel(o, timezone);
          return (
            <li
              key={o.id}
              className={`perforated relative grid grid-cols-[1fr_auto] overflow-hidden rounded-[22px] border transition-all duration-500 ease-[var(--ease-out-expo)] ${
                n > 0 ? "border-ev-accent shadow-[0_0_0_1px_var(--ev-accent)]" : "border-ev-line"
              } ${vip ? "bg-ev-fg text-ev-bg" : "bg-ev-surface"} ${buyable ? "" : "opacity-55"}`}
            >
              <div className="p-5 @xl:p-7">
                <div className="flex flex-wrap items-center gap-2 font-ev-mono text-[10px] tracking-[0.18em] uppercase">
                  <span className={vip ? "font-semibold opacity-60" : "text-ev-accent"}>{TIER_LABEL[o.tier]}</span>
                  {label && (
                    <span className={`rounded-full border px-2 py-0.5 ${vip ? "border-ev-bg/25" : "border-ev-line"}`}>{label}</span>
                  )}
                </div>
                <h3 className="mt-3 text-xl font-semibold tracking-tight @xl:text-2xl">{o.name}</h3>
                {o.description && <p className={`mt-1.5 max-w-md text-sm leading-relaxed ${vip ? "opacity-70" : "text-ev-muted"}`}>{o.description}</p>}
                <div className="ev-display mt-5 text-4xl tabular @xl:text-5xl">{formatPrice(o.priceCents, currency)}</div>
              </div>

              <div className={`flex flex-col items-center justify-center gap-3 border-l border-dashed px-4 @xl:px-7 ${vip ? "border-ev-bg/25" : "border-ev-line"}`}>
                <span className="sr-only" id={`qty-${o.id}`}>
                  Quantity for {o.name}
                </span>
                <button
                  type="button"
                  onClick={() => set(o.id, n + 1, o.maxPerOrder)}
                  disabled={!buyable || disabled || n >= o.maxPerOrder}
                  aria-label={`Add one ${o.name}`}
                  className="grid h-11 w-11 place-items-center rounded-full bg-ev-accent text-ev-on-accent transition-transform duration-300 ease-[var(--ease-spring)] hover:scale-110 active:scale-90 disabled:pointer-events-none disabled:opacity-30"
                >
                  <Plus size={18} strokeWidth={2.5} />
                </button>
                <output aria-labelledby={`qty-${o.id}`} aria-live="polite" className="font-ev-mono text-xl tabular">
                  {n}
                </output>
                <button
                  type="button"
                  onClick={() => set(o.id, n - 1, o.maxPerOrder)}
                  disabled={n === 0}
                  aria-label={`Remove one ${o.name}`}
                  className={`grid h-11 w-11 place-items-center rounded-full border transition-transform duration-300 ease-[var(--ease-spring)] hover:scale-110 active:scale-90 disabled:pointer-events-none disabled:opacity-30 ${vip ? "border-ev-bg/30" : "border-ev-line"}`}
                >
                  <Minus size={18} strokeWidth={2.5} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <aside className="rounded-[22px] border border-ev-line bg-ev-bg p-5 @4xl:sticky @4xl:top-24 @xl:p-6">
        <div className="flex items-baseline justify-between font-ev-mono text-[11px] tracking-[0.18em] text-ev-muted uppercase">
          <span>Your order</span>
          <span className="tabular">{count} {count === 1 ? "ticket" : "tickets"}</span>
        </div>
        <div className="ev-display mt-3 text-5xl tabular">{formatMoney(total, currency)}</div>

        <div className="mt-6 grid gap-3">
          <Field label="Full name" name="name" autoComplete="name" required />
          <Field label="Email for your tickets" name="email" type="email" autoComplete="email" required />
        </div>

        {state?.error && (
          <p role="alert" className="mt-4 rounded-xl border border-[color-mix(in_oklab,#ff3b30_50%,transparent)] bg-[color-mix(in_oklab,#ff3b30_12%,transparent)] px-3 py-2 text-sm">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={disabled || count === 0 || pending}
          className="group mt-5 flex w-full items-center justify-between rounded-full bg-ev-accent px-6 py-4 font-semibold text-ev-on-accent transition-all duration-300 ease-[var(--ease-spring)] hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
        >
          <span>
            {pending ? "Reserving…" : disabled ? disabledReason : count === 0 ? "Choose your tickets" : total === 0 ? "Get free tickets" : "Continue to payment"}
          </span>
          <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">→</span>
        </button>

        <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-ev-muted">
          <Lock size={13} className="mt-0.5 shrink-0" aria-hidden />
          Tickets are held for 30 minutes while you pay. We only store your name and email for this order.
        </p>
        {testMode && (
          <p className="mt-3 rounded-lg border border-dashed border-ev-line px-3 py-2 font-ev-mono text-[10px] tracking-[0.12em] uppercase">
            Test mode · no real charges
          </p>
        )}
      </aside>
    </form>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="grid gap-1.5">
      <span className="font-ev-mono text-[10px] tracking-[0.16em] text-ev-muted uppercase">{label}</span>
      <input
        {...props}
        maxLength={120}
        className="rounded-xl border border-ev-line bg-ev-surface px-3.5 py-3 text-base text-ev-fg outline-none transition-colors placeholder:text-ev-muted focus:border-ev-accent"
      />
    </label>
  );
}
