import { randomBytes, scrypt as scryptCb, type ScryptOptions } from "node:crypto";
import { safeEqual } from "@/lib/security/crypto";

const scrypt = (pw: string, salt: Buffer, keylen: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCb(pw, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );

const N = 1 << 15;
const R = 8;
const P = 1;
const KEYLEN = 32;
const maxmem = (n: number, r: number) => 128 * n * r * 2;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P, maxmem: maxmem(N, R) });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, saltB64, keyB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !keyB64) return false;
  const nn = Number(n);
  const rr = Number(r);
  // Refuse absurd parameters from a corrupted row instead of burning CPU/memory.
  if (nn > 1 << 17 || rr > 16) return false;
  const expected = Buffer.from(keyB64, "base64url");
  const key = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64url"), expected.length, {
    N: nn,
    r: rr,
    p: Number(p),
    maxmem: maxmem(nn, rr),
  });
  return safeEqual(key, expected);
}

/** Used to keep login timing uniform when the email is unknown. */
export const DUMMY_HASH =
  "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
