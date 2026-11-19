import { eq } from "drizzle-orm";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { canAccessEvent } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { checkinTotals } from "@/lib/tickets/checkin";
import { Scanner } from "./scanner";

export const metadata: Metadata = { title: "Scanner" };
export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function ScanEvent({ params }: PageProps<"/scan/[eventId]">) {
  const { eventId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) notFound();
  const user = await requireUser(`/scan/${eventId}`);
  if (!(await canAccessEvent(user.id, eventId, "scan"))) notFound();
  const [ev] = await db.select({ title: events.title, accent: events.design }).from(events).where(eq(events.id, eventId));
  const totals = await checkinTotals(eventId);
  return <Scanner eventId={eventId} title={ev.title} accent={ev.accent.accent} initialTotals={totals} staffName={user.name} />;
}
