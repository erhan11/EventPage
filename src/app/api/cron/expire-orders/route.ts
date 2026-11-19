import { env } from "@/lib/env";
import { safeEqual } from "@/lib/security/crypto";
import { expireStaleOrders } from "@/lib/tickets/orders";

/** Releases abandoned checkout holds. Schedule every few minutes (e.g. Vercel Cron). */
export async function GET(req: Request) {
  const secret = env.cronSecret;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });
  const released = await expireStaleOrders(new Date(), 500);
  return Response.json({ released });
}
