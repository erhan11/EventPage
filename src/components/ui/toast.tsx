"use client";

import { Check, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

type Tone = "ok" | "danger" | "neutral";
interface Toast {
  id: number;
  message: string;
  tone: Tone;
}

let push: ((t: Toast) => void) | null = null;
let seq = 0;

/** Fire-and-forget feedback ("Refund started", errors) — replaces alert(). */
export function showToast(message: string, tone: Tone = "neutral") {
  push?.({ id: ++seq, message, tone });
}

const toneCls: Record<Tone, string> = {
  ok: "border-ok/40",
  danger: "border-danger/40",
  neutral: "border-line-strong",
};

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    push = (t) => {
      setItems((s) => [...s.slice(-3), t]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== t.id)), 4200);
    };
    return () => {
      push = null;
    };
  }, []);
  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[90] flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex max-w-md items-start gap-2.5 rounded-2xl border bg-raised px-4 py-3 text-sm shadow-[var(--shadow)] animate-rise ${toneCls[t.tone]}`}
        >
          {t.tone === "ok" && <Check size={15} className="mt-0.5 shrink-0 text-ok" />}
          {t.tone === "danger" && <TriangleAlert size={15} className="mt-0.5 shrink-0 text-danger" />}
          {t.message}
        </div>
      ))}
    </div>
  );
}
