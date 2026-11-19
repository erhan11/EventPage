import type { EventDesign, LineupEntry, ScheduleEntry, SocialLinks } from "./types";

/** Serializable shape rendered by <EventView/> — shared by the public page and the editor preview. */
export interface EventViewModel {
  id: string;
  slug: string;
  orgName: string;
  title: string;
  tagline: string;
  description: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  venueName: string;
  venueAddress: string;
  city: string;
  country: string;
  currency: string;
  design: EventDesign;
  lineup: LineupEntry[];
  schedule: ScheduleEntry[];
  socials: SocialLinks;
  status: "draft" | "published" | "cancelled";
  tickets: TicketOption[];
}

export interface TicketOption {
  id: string;
  name: string;
  description: string;
  tier: "early_bird" | "general" | "vip" | "free";
  priceCents: number;
  maxPerOrder: number;
  /** Rounded availability — we don't expose exact inventory publicly. */
  availability: "available" | "low" | "sold_out" | "not_started" | "ended";
  salesStartAt: string | null;
}

export const TIER_LABEL: Record<TicketOption["tier"], string> = {
  early_bird: "Early Bird",
  general: "General Admission",
  vip: "VIP",
  free: "Free Entry",
};

export function availabilityOf(
  t: { capacity: number; sold: number; reserved: number; salesStartAt: Date | null; salesEndAt: Date | null },
  now = new Date(),
): TicketOption["availability"] {
  if (t.salesStartAt && t.salesStartAt > now) return "not_started";
  if (t.salesEndAt && t.salesEndAt <= now) return "ended";
  const left = t.capacity - t.sold - t.reserved;
  if (left <= 0) return "sold_out";
  if (left <= Math.max(5, Math.ceil(t.capacity * 0.1))) return "low";
  return "available";
}
