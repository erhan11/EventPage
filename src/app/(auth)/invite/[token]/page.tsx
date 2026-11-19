import { and, eq, gt, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import { AuthShell } from "@/components/ui/auth-shell";
import { db } from "@/lib/db";
import { events, organizations, staffInvites } from "@/lib/db/schema";
import { sha256 } from "@/lib/security/crypto";
import { InviteForm } from "./form";

export const metadata: Metadata = { title: "Door staff invite", robots: { index: false }, referrer: "no-referrer" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const [row] =
    token.length <= 64
      ? await db
          .select({ email: staffInvites.email, eventTitle: events.title, orgName: organizations.name })
          .from(staffInvites)
          .innerJoin(events, eq(events.id, staffInvites.eventId))
          .innerJoin(organizations, eq(organizations.id, staffInvites.orgId))
          .where(and(eq(staffInvites.tokenHash, sha256(token)), isNull(staffInvites.acceptedAt), gt(staffInvites.expiresAt, new Date())))
          .limit(1)
      : [];

  if (!row) {
    return (
      <AuthShell kicker="Door staff" title="Invite unavailable">
        <p className="text-muted">This link is invalid, already used, or expired. Ask the organizer for a new invite.</p>
      </AuthShell>
    );
  }
  return (
    <AuthShell kicker={`${row.orgName} · door staff`} title={<>Scan for {row.eventTitle}</>}>
      <p className="-mt-4 mb-6 text-sm text-muted">
        Invite for <span className="font-medium text-fg">{row.email}</span>. You&apos;ll only have access to this event&apos;s door.
      </p>
      <InviteForm token={token} />
    </AuthShell>
  );
}
