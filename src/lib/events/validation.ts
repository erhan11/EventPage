import { z } from "zod";
import { THEMES, TYPOGRAPHY } from "./design";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #d4ff3a");
const httpsUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^https:\/\/[^\s<>"']+$/i.test(v), "Links must start with https://");
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Invalid date");
const shortId = z.string().min(1).max(40);

/** Only our own blob store (BLOB_PUBLIC_HOST, e.g. abc123.public.blob.vercel-storage.com). */
function isOwnBlobUrl(v: string) {
  const host = process.env.BLOB_PUBLIC_HOST;
  if (!host) return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && u.host === host;
  } catch {
    return false;
  }
}

export const designSchema = z.object({
  theme: z.enum(Object.keys(THEMES) as [keyof typeof THEMES, ...(keyof typeof THEMES)[]]),
  typography: z.enum(Object.keys(TYPOGRAPHY) as [keyof typeof TYPOGRAPHY, ...(keyof typeof TYPOGRAPHY)[]]),
  background: hex,
  foreground: hex,
  accent: hex,
  art: z.enum(["waves", "orbit", "mesh", "grid", "image"]),
  artSeed: z.number().int().min(0).max(1_000_000),
  // Only images we host (local uploads or our blob store) — never arbitrary third-party URLs.
  heroImageUrl: z
    .string()
    .max(500)
    .refine((v) => v.startsWith("/uploads/") || isOwnBlobUrl(v), "Upload an image instead")
    .nullable(),
});

export const eventDraftSchema = z
  .object({
    title: z.string().trim().max(80),
    slug: z
      .string()
      .trim()
      .min(3, "URL must be at least 3 characters")
      .max(48)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, numbers and dashes only"),
    tagline: z.string().trim().max(160),
    description: z.string().trim().max(4000),
    startsLocal: localDateTime,
    endsLocal: localDateTime,
    timezone: z.string().refine((tz) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Unknown timezone"),
    venueName: z.string().trim().max(100),
    venueAddress: z.string().trim().max(200),
    city: z.string().trim().max(80),
    country: z.string().trim().max(80),
    capacity: z.number().int().min(1).max(200_000).nullable(),
    currency: z.enum(["EUR", "GBP", "USD", "CHF", "SEK", "DKK", "NOK", "PLN", "CZK", "TRY", "AUD", "CAD"]),
    design: designSchema,
    lineup: z
      .array(
        z.object({
          id: shortId,
          name: z.string().trim().max(60),
          billing: z.string().trim().max(40),
          genre: z.string().trim().max(40),
          time: z.string().trim().max(20),
        }),
      )
      .max(40),
    schedule: z.array(z.object({ id: shortId, time: z.string().trim().max(20), label: z.string().trim().max(80) })).max(30),
    socials: z.object({
      instagram: httpsUrl.optional(),
      soundcloud: httpsUrl.optional(),
      residentAdvisor: httpsUrl.optional(),
      website: httpsUrl.optional(),
    }),
  })
  .refine((v) => v.endsLocal > v.startsLocal, { message: "The event must end after it starts", path: ["endsLocal"] });

export type EventDraft = z.infer<typeof eventDraftSchema>;

export const ticketTypeSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Name the ticket").max(60),
  description: z.string().trim().max(200),
  tier: z.enum(["early_bird", "general", "vip", "free"]),
  priceCents: z.number().int().min(0).max(1_000_000),
  capacity: z.number().int().min(0).max(200_000),
  maxPerOrder: z.number().int().min(1).max(20),
  salesStartLocal: z.string().regex(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})?$/),
  salesEndLocal: z.string().regex(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})?$/),
  isActive: z.boolean(),
});

export type TicketTypeInput = z.infer<typeof ticketTypeSchema>;
