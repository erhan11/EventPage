"use client";

import { useFormStatus } from "react-dom";

export function GatewayButtons({ amount }: { amount: string }) {
  const { pending } = useFormStatus();
  return (
    <div className="mt-2 grid gap-2">
      <button
        name="outcome"
        value="pay"
        disabled={pending}
        className="rounded-lg bg-[#635bff] px-4 py-3 font-semibold text-white transition hover:bg-[#5248f0] disabled:opacity-60"
      >
        {pending ? "Processing…" : `Pay ${amount}`}
      </button>
      <button
        name="outcome"
        value="decline"
        disabled={pending}
        className="rounded-lg border border-black/10 px-4 py-2.5 text-sm transition hover:bg-black/5 disabled:opacity-60 dark:border-white/10 dark:hover:bg-white/5"
      >
        Simulate declined card
      </button>
    </div>
  );
}
