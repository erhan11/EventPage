import { z } from "zod";
import { canAccessEvent } from "@/lib/auth/access";
import { getCurrentUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/security/rate-limit";
import { checkinTotals, scanTicket } from "@/lib/tickets/checkin";

const body = z.object({ eventId: z.uuid(), input: z.string().min(1).max(128) });

function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  try {
    return !!origin && new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

/** Validate + admit. Authorization: the signed-in user must be allowed to scan this event. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Bad origin" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Signed out" }, { status: 401 });
  // Generous enough for a busy door, tight enough to stop brute-forcing manual codes.
  if (!rateLimit(`scan:${user.id}`, 180, 60_000).ok) return Response.json({ error: "Slow down" }, { status: 429 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const { eventId, input } = parsed.data;
  if (!(await canAccessEvent(user.id, eventId, "scan"))) return Response.json({ error: "Not assigned to this event" }, { status: 403 });

  const result = await scanTicket({ input, eventId, staffUserId: user.id, signingSecret: env.ticketSigningSecret });
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Signed out" }, { status: 401 });
  const eventId = new URL(req.url).searchParams.get("eventId") ?? "";
  if (!z.uuid().safeParse(eventId).success || !(await canAccessEvent(user.id, eventId, "scan")))
    return Response.json({ error: "Forbidden" }, { status: 403 });
  return Response.json(await checkinTotals(eventId), { headers: { "cache-control": "no-store" } });
}
