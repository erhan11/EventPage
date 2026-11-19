import { hmac, safeEqual } from "./crypto";

/**
 * QR payload format:  EP1.<ticketId as base64url(16 bytes)>.<HMAC-SHA256 truncated to 16 bytes, base64url>
 *
 * The signature makes tokens unforgeable without TICKET_SIGNING_SECRET, so the door
 * rejects garbage before touching the database. Validity (void / used) is still
 * decided server-side against the ticket row — a valid signature alone admits no one.
 */
const PREFIX = "EP1";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const B64_22 = /^[A-Za-z0-9_-]{22}$/;

function uuidToB64(id: string) {
  return Buffer.from(id.replace(/-/g, ""), "hex").toString("base64url");
}

function b64ToUuid(b64: string): string | null {
  const buf = Buffer.from(b64, "base64url");
  if (buf.length !== 16) return null;
  const h = buf.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const sign = (secret: string, idPart: string) =>
  hmac(secret, `${PREFIX}:ticket:${idPart}`).subarray(0, 16).toString("base64url");

export function createTicketToken(ticketId: string, secret: string): string {
  if (!UUID_RE.test(ticketId)) throw new Error("Invalid ticket id");
  const idPart = uuidToB64(ticketId.toLowerCase());
  return `${PREFIX}.${idPart}.${sign(secret, idPart)}`;
}

/** Returns the ticket id when the signature is valid, otherwise null. */
export function verifyTicketToken(token: string, secret: string): string | null {
  if (typeof token !== "string" || token.length > 128) return null;
  const parts = token.trim().split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const [, idPart, sig] = parts;
  if (!B64_22.test(idPart) || !B64_22.test(sig)) return null;
  // Reject non-canonical encodings so one ticket maps to exactly one token string.
  if (Buffer.from(idPart, "base64url").toString("base64url") !== idPart) return null;
  if (!safeEqual(sig, sign(secret, idPart))) return null;
  return b64ToUuid(idPart);
}
