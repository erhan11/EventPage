import "server-only";
import { headers } from "next/headers";

/**
 * Fixed-window rate limiter.
 *
 * In-memory storage is correct for a single Node process (local dev, one container).
 * On multi-instance / serverless deployments, swap `store` for a shared backend
 * (e.g. Upstash Redis) — the interface is intentionally tiny.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const g = globalThis as unknown as { __epRate?: Map<string, Bucket> };
const store = (g.__epRate ??= new Map<string, Bucket>());

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(key: string, limit: number, windowMs: number, cost = 1): RateLimitResult {
  const now = Date.now();
  let b = store.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    store.set(key, b);
  }
  b.count += cost;
  if (store.size > 50_000) {
    for (const [k, v] of store) if (v.resetAt <= now) store.delete(k);
  }
  return {
    ok: b.count <= limit,
    remaining: Math.max(0, limit - b.count),
    retryAfterSec: Math.ceil((b.resetAt - now) / 1000),
  };
}

/**
 * Client IP from a header the *deployment* controls. Client-supplied forwarding headers are
 * never trusted by default (they'd let anyone dodge rate limits by rotating them).
 *  - TRUSTED_IP_HEADER=x-real-ip (nginx), fly-client-ip (Fly), cf-connecting-ip (Cloudflare)…
 *  - On Vercel, x-vercel-forwarded-for is set by the platform and used automatically.
 * Without either, all requests share one bucket — safe, just coarse (fine for local dev).
 */
export function ipFromHeaders(h: Headers): string {
  const name = process.env.TRUSTED_IP_HEADER?.toLowerCase() || (process.env.VERCEL ? "x-vercel-forwarded-for" : "");
  if (!name) return "untrusted-network";
  const v = h.get(name)?.split(",")[0]?.trim();
  return v && v.length <= 64 ? v : "unknown";
}

export async function clientIp(): Promise<string> {
  return ipFromHeaders(await headers());
}

export async function limitByIp(scope: string, limit: number, windowMs: number) {
  return rateLimit(`${scope}:${await clientIp()}`, limit, windowMs);
}
