import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export const hmac = (secret: string, value: string | Buffer) =>
  createHmac("sha256", secret).update(value).digest();

export function safeEqual(a: string | Buffer, b: string | Buffer): boolean {
  const ba = Buffer.isBuffer(a) ? a : Buffer.from(a);
  const bb = Buffer.isBuffer(b) ? b : Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Unambiguous alphabet for door codes (no 0/O/1/I/L). */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export function humanCode(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}
