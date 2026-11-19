import { canAccessEvent } from "@/lib/auth/access";
import { getCurrentUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rate-limit";
import { MAX_UPLOAD_BYTES, storeImage } from "@/lib/storage";

const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(req: Request) {
  // CSRF: cookies are SameSite=Lax, and we additionally require a same-origin request.
  const origin = req.headers.get("origin");
  if (!origin || new URL(origin).host !== req.headers.get("host")) return new Response("Bad origin", { status: 403 });

  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!rateLimit(`upload:${user.id}`, 20, 10 * 60_000).ok) return new Response("Too many uploads", { status: 429 });

  // Require a declared length so chunked bodies can't bypass the cap before formData() buffers them.
  const len = Number(req.headers.get("content-length") ?? NaN);
  if (!Number.isFinite(len)) return Response.json({ error: "Length required" }, { status: 411 });
  if (len > MAX_UPLOAD_BYTES + 64 * 1024) return Response.json({ error: "Image must be under 6 MB." }, { status: 413 });

  const form = await req.formData();
  const eventId = String(form.get("eventId") ?? "");
  const file = form.get("file");
  if (!UUID.test(eventId) || !(file instanceof File)) return Response.json({ error: "Bad request" }, { status: 400 });
  if (!(await canAccessEvent(user.id, eventId, "manage"))) return new Response("Forbidden", { status: 403 });
  if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: "Image must be under 6 MB." }, { status: 413 });

  try {
    const url = await storeImage(Buffer.from(await file.arrayBuffer()), eventId);
    return Response.json({ url });
  } catch (e) {
    return Response.json({ error: (e as Error).message === "Unsupported image type" ? "Use a JPG, PNG, WebP or AVIF image." : "Upload failed." }, { status: 400 });
  }
}
