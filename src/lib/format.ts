/** Formatting is pinned to a locale + the event's timezone so server and client render identically. */
const LOCALE = "en-GB";

export function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function formatPrice(cents: number, currency: string) {
  return cents === 0 ? "Free" : formatMoney(cents, currency);
}

function parts(date: Date | string, timeZone: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(LOCALE, { timeZone, ...opts }).format(new Date(date));
}

export const fmt = {
  weekday: (d: Date | string, tz: string) => parts(d, tz, { weekday: "long" }),
  weekdayShort: (d: Date | string, tz: string) => parts(d, tz, { weekday: "short" }),
  day: (d: Date | string, tz: string) => parts(d, tz, { day: "2-digit" }),
  month: (d: Date | string, tz: string) => parts(d, tz, { month: "long" }),
  monthShort: (d: Date | string, tz: string) => parts(d, tz, { month: "short" }),
  year: (d: Date | string, tz: string) => parts(d, tz, { year: "numeric" }),
  time: (d: Date | string, tz: string) => parts(d, tz, { hour: "2-digit", minute: "2-digit", hour12: false }),
  date: (d: Date | string, tz: string) => parts(d, tz, { day: "numeric", month: "short", year: "numeric" }),
  dateTime: (d: Date | string, tz: string) =>
    parts(d, tz, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }),
  /** "SAT 14.06" */
  stamp: (d: Date | string, tz: string) =>
    `${parts(d, tz, { weekday: "short" }).toUpperCase()} ${parts(d, tz, { day: "2-digit" })}.${parts(d, tz, { month: "2-digit" })}`,
};

/**
 * Converts a wall-clock "YYYY-MM-DDTHH:mm" in `timeZone` to a UTC Date.
 * Iterates twice to settle DST transitions.
 */
export function zonedLocalToUtc(local: string, timeZone: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) throw new Error("Invalid local datetime");
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const target = Date.UTC(y, mo - 1, d, h, mi);
  let guess = target;
  for (let i = 0; i < 2; i++) guess = target - tzOffsetMs(new Date(guess), timeZone);
  return new Date(guess);
}

function tzOffsetMs(date: Date, timeZone: string) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** UTC Date → "YYYY-MM-DDTHH:mm" wall clock in `timeZone` (for datetime-local inputs). */
export function utcToZonedLocal(date: Date | string, timeZone: string): string {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(date));
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
