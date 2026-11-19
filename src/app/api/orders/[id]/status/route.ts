import { ipFromHeaders, rateLimit } from "@/lib/security/rate-limit";
import { findOrderByAccessToken } from "@/lib/tickets/orders";

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(req: Request, ctx: RouteContext<"/api/orders/[id]/status">) {
  const { id } = await ctx.params;
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!UUID.test(id) || !token || token.length > 64) return new Response(null, { status: 404 });
  const ip = ipFromHeaders(req.headers);
  if (!rateLimit(`order-status:${ip}`, 90, 60_000).ok) return new Response(null, { status: 429 });

  const order = await findOrderByAccessToken(id, token);
  if (!order) return new Response(null, { status: 404 });
  return Response.json({ status: order.status }, { headers: { "cache-control": "no-store" } });
}
