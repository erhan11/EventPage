import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { events, eventStaff, memberships } from "@/lib/db/schema";

/**
 * Tenant isolation lives here. Every organizer/staff read or write of an event
 * goes through one of these checks; queries never trust an orgId from the client.
 */

export type EventPermission = "manage" | "scan";

export class ForbiddenError extends Error {
  constructor(message = "Not allowed") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export async function getMembership(userId: string) {
  const rows = await db
    .select({ orgId: memberships.orgId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.userId, userId));
  return rows;
}

/** Org the user manages (owner/admin). Organizers have exactly one in this version. */
export async function getManagedOrgId(userId: string): Promise<string | null> {
  const rows = await getMembership(userId);
  return rows.find((r) => r.role === "owner" || r.role === "admin")?.orgId ?? null;
}

/**
 * - manage: owner/admin of the event's organization.
 * - scan:   manage, or staff explicitly assigned to this event.
 */
export async function canAccessEvent(
  userId: string,
  eventId: string,
  permission: EventPermission,
): Promise<boolean> {
  const [ev] = await db.select({ orgId: events.orgId }).from(events).where(eq(events.id, eventId)).limit(1);
  if (!ev) return false;
  const [m] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.orgId, ev.orgId)))
    .limit(1);
  if (m && (m.role === "owner" || m.role === "admin")) return true;
  if (permission === "manage") return false;
  const [assigned] = await db
    .select({ e: eventStaff.eventId })
    .from(eventStaff)
    .where(and(eq(eventStaff.eventId, eventId), eq(eventStaff.userId, userId)))
    .limit(1);
  // Staff must also still belong to the organization.
  return Boolean(assigned && m);
}

export async function assertEventAccess(userId: string, eventId: string, permission: EventPermission) {
  if (!(await canAccessEvent(userId, eventId, permission))) throw new ForbiddenError();
}
