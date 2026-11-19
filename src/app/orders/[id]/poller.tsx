"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Waits for the server to record a verified payment. The page never assumes success
 * from the redirect alone — it only shows tickets once the webhook has issued them.
 */
export function PaymentPoller({ orderId, token }: { orderId: string; token: string }) {
  const router = useRouter();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let stopped = false;
    let attempt = 0;
    async function tick() {
      if (stopped) return;
      attempt++;
      try {
        const res = await fetch(`/api/orders/${orderId}/status`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (res.ok) {
          const { status } = (await res.json()) as { status: string };
          if (status !== "pending") {
            router.refresh();
            return;
          }
        }
      } catch {
        /* network blip — keep polling */
      }
      if (attempt === 15) setSlow(true);
      setTimeout(tick, Math.min(1500 + attempt * 250, 6000));
    }
    tick();
    return () => {
      stopped = true;
    };
  }, [orderId, token, router]);

  return (
    <div role="status" aria-live="polite" className="mt-10 rounded-3xl border border-ev-line bg-ev-surface p-6">
      <div className="flex items-center gap-3">
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full rounded-full bg-ev-accent" style={{ animation: "pulse-ring 1.4s ease-out infinite" }} />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-ev-accent" />
        </span>
        <h2 className="text-xl font-semibold">Confirming your payment</h2>
      </div>
      <p className="mt-3 leading-relaxed text-ev-muted">
        Your tickets are held. They&apos;ll appear here the moment the payment provider confirms — usually within a few
        seconds.
        {slow && " This is taking longer than usual; you can safely keep this page open or come back to this link later."}
      </p>
    </div>
  );
}
