"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/format";

/**
 * Mobile-only bottom bar ("Tickets from €18 →") that hides itself once the
 * tickets section is on screen. The single biggest conversion nudge on phones.
 */
export function TicketStickyBar({ fromCents, currency }: { fromCents: number; currency: string }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const el = document.getElementById("tickets");
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setHidden(entry.isIntersecting), { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 px-3 transition-transform duration-500 ease-[var(--ease-out-expo)] @3xl:hidden ${hidden ? "translate-y-[120%]" : ""}`}
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
    >
      <a
        href="#tickets"
        className="flex items-center justify-between rounded-full bg-ev-accent px-6 py-4 font-semibold text-ev-on-accent shadow-[0_18px_40px_-12px_rgba(0,0,0,0.5)] active:scale-[0.98]"
      >
        <span>{fromCents === 0 ? "Free entry — get tickets" : `Tickets from ${formatPrice(fromCents, currency)}`}</span>
        <span aria-hidden>↓</span>
      </a>
    </div>
  );
}
