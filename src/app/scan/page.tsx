import { and, asc, eq, gt, inArray, or } from "drizzle-orm";
import { ArrowRight, LogOut } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { Logo } from "@/components/ui/brand";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { events, eventStaff, memberships } from "@/lib/db/schema";
import { fmt } from "@/lib/format";

export const metadata: Metadata = { title: "Door" };

/** Keep events visible until 12h after they end (late scans, re-entry checks). */
const recentCutoff = () => new Date(Date.now() - 12 * 36e5);

export default async function ScanHome() {
  const user = await requireUser("/scan");
  const ms = await db.select().from(memberships).where(eq(memberships.userId, user.id));
  const managedOrgs = ms.filter((m) => m.role !== "staff").map((m) => m.orgId);
  const assigned = (await db.select({ id: eventStaff.eventId }).from(eventStaff).where(eq(eventStaff.userId, user.id))).map((r) => r.id);
  const staffOrgs = ms.filter((m) => m.role === "staff").map((m) => m.orgId);

  const conds = [];
  if (managedOrgs.length) conds.push(inArray(events.orgId, managedOrgs));
  // Staff see only events they're assigned to, within orgs they still belong to.
  if (assigned.length && staffOrgs.length) conds.push(and(inArray(events.id, assigned), inArray(events.orgId, staffOrgs)));
  const list = conds.length
    ? await db
        .select()
        .from(events)
        .where(and(or(...conds), eq(events.status, "published"), gt(events.endsAt, recentCutoff())))
        .orderBy(asc(events.startsAt))
    : [];

  return (
    <main data-theme="dark" className="min-h-svh bg-[#0a0a0b] px-5 py-6 text-[#f2f1ec] [color-scheme:dark]">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between">
          <Logo />
          <form action={signOut}>
            <button className="grid h-10 w-10 place-items-center rounded-full text-[#8d8c86] hover:bg-white/5" aria-label="Sign out">
              <LogOut size={17} />
            </button>
          </form>
        </div>
        <h1 className="display-serif mt-12 text-6xl italic">Door</h1>
        <p className="mt-3 text-[#8d8c86]">Signed in as {user.name}. Choose your event.</p>
        <ul className="mt-8 grid gap-3">
          {list.length === 0 && (
            <li className="rounded-3xl border border-dashed border-white/15 p-8 text-center text-[#8d8c86]">
              No upcoming events assigned to you. Ask your organizer for an invite.
            </li>
          )}
          {list.map((e) => (
            <li key={e.id}>
              <Link
                href={`/scan/${e.id}`}
                className="flex items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5 transition-colors active:bg-white/10"
                style={{ boxShadow: `inset 4px 0 0 ${e.design.accent}` }}
              >
                <div className="min-w-0">
                  <div className="label-mono text-[#8d8c86]">
                    {fmt.weekdayShort(e.startsAt, e.timezone)} {fmt.date(e.startsAt, e.timezone)} · {fmt.time(e.startsAt, e.timezone)}
                  </div>
                  <div className="mt-1 truncate text-xl font-semibold">{e.title}</div>
                  <div className="text-sm text-[#8d8c86]">{e.venueName}</div>
                </div>
                <ArrowRight size={20} />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
