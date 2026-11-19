"use client";

import { Check, Copy, UserMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { inviteStaff, refundOrder, removeStaff, setEventStatus } from "@/app/actions/events";
import { Button, Card, Input } from "@/components/ui/primitives";

export function PublishControls({ eventId, status }: { eventId: string; status: "draft" | "published" | "cancelled" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (next: "published" | "draft" | "cancelled", confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setError(null);
    start(async () => {
      const r = await setEventStatus(eventId, next);
      if (!r.ok) setError(r.error);
      router.refresh();
    });
  };

  if (status === "cancelled") return null;
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        {status === "published" ? (
          <>
            <Button variant="ghost" disabled={pending} onClick={() => run("draft", "Unpublish? The page goes offline and sales stop. Existing tickets stay valid.")}>
              Unpublish
            </Button>
            <Button variant="danger" disabled={pending} onClick={() => run("cancelled", "Cancel this event? This can't be undone. Refund orders from the attendee list.")}>
              Cancel event
            </Button>
          </>
        ) : (
          <Button disabled={pending} onClick={() => run("published")} className="bg-accent text-accent-ink hover:bg-accent hover:brightness-95">
            {pending ? "Publishing…" : "Publish & start selling"}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="max-w-sm text-right text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function OrderActions({ eventId, orderId, buyer, hasCheckedIn, retry }: { eventId: string; orderId: string; buyer: string; hasCheckedIn: boolean; retry?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => {
        const msg = retry ? `Retry the Stripe refund for ${buyer}?` : `Refund ${buyer}'s order? Unused tickets are cancelled immediately and return to sale.${hasCheckedIn ? " Tickets already scanned stay counted." : ""}`;
        if (!confirm(msg)) return;
        start(async () => {
          const r = await refundOrder(eventId, orderId);
          if (!r.ok) alert(r.error);
          router.refresh();
        });
      }}
      className="label-mono rounded-full border border-line px-3 py-1.5 text-[10px] text-muted transition-colors hover:border-danger/50 hover:text-danger disabled:opacity-40"
    >
      {pending ? "…" : retry ? "Retry refund" : "Refund"}
    </button>
  );
}

export function StaffPanel({ eventId, staff }: { eventId: string; staff: { id: string; name: string; email: string }[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [emailed, setEmailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <section aria-labelledby="staff-h">
      <h2 id="staff-h" className="label-mono mb-4">Door staff</h2>
      <Card className="p-5">
        {staff.length > 0 && (
          <ul className="mb-5 grid gap-1">
            {staff.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{s.name}</span> <span className="truncate text-muted">{s.email}</span>
                </span>
                <button
                  aria-label={`Remove ${s.name}`}
                  onClick={() => start(async () => { await removeStaff(eventId, s.id); router.refresh(); })}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-danger"
                >
                  <UserMinus size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const r = await inviteStaff(eventId, email);
              if (r.ok) {
                setLink(r.url);
                setEmailed(r.emailed);
                setEmail("");
              } else setError(r.error);
            });
          }}
        >
          <label className="label-mono text-muted" htmlFor="staff-email">
            Invite by email
          </label>
          <div className="flex gap-2">
            <Input id="staff-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="door@club.com" />
            <Button disabled={pending} type="submit">
              Invite
            </Button>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
        </form>
        {link && (
          <div className="mt-4 rounded-2xl bg-surface p-4">
            <p className="text-sm">{emailed ? "Invite emailed. You can also share this single-use link (valid 7 days)." : "Send this single-use link to your staff member (valid 7 days)."} They can only scan this event.</p>
            <div className="mt-3 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-raised px-3 py-2 text-xs">{link}</code>
              <Button
                variant="secondary"
                className="h-9 w-9 shrink-0 px-0"
                aria-label="Copy invite link"
                onClick={async () => {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}
