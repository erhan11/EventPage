/**
 * Post-login redirect target. Only same-origin paths under known app areas are allowed;
 * anything with control characters, backslashes or protocol-relative tricks is rejected.
 */
const ALLOWED_PREFIXES = ["/dashboard", "/scan"];

export function safeNextPath(next: unknown, fallback: string): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 200) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  let url: URL;
  try {
    url = new URL(next, "https://app.invalid");
  } catch {
    return fallback;
  }
  if (url.origin !== "https://app.invalid") return fallback;
  const ok = ALLOWED_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`));
  return ok ? `${url.pathname}${url.search}` : fallback;
}
