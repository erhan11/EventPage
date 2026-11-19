import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { EventDesign, LineupEntry, ScheduleEntry, SocialLinks } from "@/lib/events/types";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/* ───────────────────────── Identity & tenancy ───────────────────────── */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`)],
);

/** Session ids are SHA-256 hashes of the cookie token; the raw token is never stored. */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const memberRole = pgEnum("member_role", ["owner", "admin", "staff"]);

export const memberships = pgTable(
  "memberships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.orgId] })],
);

/* ───────────────────────────── Events ───────────────────────────── */

export const eventStatus = pgEnum("event_status", ["draft", "published", "cancelled"]);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    status: eventStatus("status").notNull().default("draft"),
    title: text("title").notNull(),
    tagline: text("tagline").notNull().default(""),
    description: text("description").notNull().default(""),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    timezone: text("timezone").notNull().default("Europe/Berlin"),
    venueName: text("venue_name").notNull().default(""),
    venueAddress: text("venue_address").notNull().default(""),
    city: text("city").notNull().default(""),
    country: text("country").notNull().default(""),
    /** Optional hard cap across all ticket types. */
    capacity: integer("capacity"),
    currency: text("currency").notNull().default("EUR"),
    design: jsonb("design").$type<EventDesign>().notNull(),
    lineup: jsonb("lineup").$type<LineupEntry[]>().notNull().default([]),
    schedule: jsonb("schedule").$type<ScheduleEntry[]>().notNull().default([]),
    socials: jsonb("socials").$type<SocialLinks>().notNull().default({}),
    publishedAt: ts("published_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("events_org_idx").on(t.orgId),
    check("events_capacity_positive", sql`${t.capacity} is null or ${t.capacity} > 0`),
    check("events_time_order", sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

/** Staff assigned to scan tickets at a specific event. */
export const eventStaff = pgTable(
  "event_staff",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] })],
);

/** Single-use invite links for door staff. Token stored hashed. */
export const staffInvites = pgTable("staff_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  expiresAt: ts("expires_at").notNull(),
  acceptedAt: ts("accepted_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const ticketTier = pgEnum("ticket_tier", ["early_bird", "general", "vip", "free"]);

export const ticketTypes = pgTable(
  "ticket_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    tier: ticketTier("tier").notNull().default("general"),
    /** Integer minor units. 0 = free ticket. */
    priceCents: integer("price_cents").notNull(),
    capacity: integer("capacity").notNull(),
    /** Issued tickets (paid or free). */
    sold: integer("sold").notNull().default(0),
    /** Held by pending checkouts; released on expiry/cancel. */
    reserved: integer("reserved").notNull().default(0),
    maxPerOrder: integer("max_per_order").notNull().default(10),
    salesStartAt: ts("sales_start_at"),
    salesEndAt: ts("sales_end_at"),
    isActive: boolean("is_active").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("ticket_types_event_idx").on(t.eventId),
    check("ticket_types_price_nonneg", sql`${t.priceCents} >= 0`),
    check("ticket_types_capacity_nonneg", sql`${t.capacity} >= 0`),
    check("ticket_types_counts_nonneg", sql`${t.sold} >= 0 and ${t.reserved} >= 0`),
    // The database itself refuses to oversell, even if application logic is wrong.
    check("ticket_types_no_oversell", sql`${t.sold} + ${t.reserved} <= ${t.capacity}`),
    check("ticket_types_max_per_order", sql`${t.maxPerOrder} between 1 and 50`),
  ],
);

/* ───────────────────────────── Commerce ───────────────────────────── */

export const orderStatus = pgEnum("order_status", [
  "pending", // inventory reserved, awaiting verified payment
  "paid", // payment verified (or free) — tickets issued
  "expired", // checkout abandoned, reservation released
  "cancelled", // buyer/organizer cancelled before payment
  "refund_pending", // refund requested at provider, tickets already voided
  "refunded", // provider confirmed refund
]);

export const paymentProvider = pgEnum("payment_provider", ["free", "stripe", "test_simulator"]);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    status: orderStatus("status").notNull().default("pending"),
    provider: paymentProvider("provider").notNull(),
    providerSessionId: text("provider_session_id"),
    providerPaymentId: text("provider_payment_id"),
    /** Buyer contact — the only personal data we keep. */
    buyerName: text("buyer_name").notNull(),
    buyerEmail: text("buyer_email").notNull(),
    totalCents: integer("total_cents").notNull(),
    currency: text("currency").notNull(),
    /** Hash of the bearer token that lets the buyer view their tickets without an account. */
    accessTokenHash: text("access_token_hash").notNull(),
    /** Second bearer token, minted when the tickets email is sent (we never store raw tokens). */
    emailAccessHash: text("email_access_hash"),
    ticketsEmailedAt: ts("tickets_emailed_at"),
    expiresAt: ts("expires_at").notNull(),
    paidAt: ts("paid_at"),
    refundedAt: ts("refunded_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("orders_event_idx").on(t.eventId),
    index("orders_status_expiry_idx").on(t.status, t.expiresAt),
    uniqueIndex("orders_provider_session_idx").on(t.providerSessionId),
    check("orders_total_nonneg", sql`${t.totalCents} >= 0`),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    ticketTypeId: uuid("ticket_type_id")
      .notNull()
      .references(() => ticketTypes.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
  },
  (t) => [
    index("order_items_order_idx").on(t.orderId),
    check("order_items_qty_positive", sql`${t.quantity} > 0`),
  ],
);

export const ticketStatus = pgEnum("ticket_status", ["valid", "checked_in", "void"]);

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "restrict" }),
    /** Position within the order item — (orderItemId, seq) is unique, making issuance idempotent. */
    seq: integer("seq").notNull(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    ticketTypeId: uuid("ticket_type_id")
      .notNull()
      .references(() => ticketTypes.id, { onDelete: "restrict" }),
    /** Short human-readable code for manual lookup at the door. */
    code: text("code").notNull(),
    status: ticketStatus("status").notNull().default("valid"),
    checkedInAt: ts("checked_in_at"),
    checkedInBy: uuid("checked_in_by").references(() => users.id, { onDelete: "set null" }),
    voidReason: text("void_reason"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tickets_item_seq_idx").on(t.orderItemId, t.seq),
    uniqueIndex("tickets_event_code_idx").on(t.eventId, t.code),
    index("tickets_event_status_idx").on(t.eventId, t.status),
    index("tickets_order_idx").on(t.orderId),
  ],
);

export const checkinResult = pgEnum("checkin_result", [
  "admitted",
  "already_checked_in",
  "void",
  "wrong_event",
  "invalid",
]);

/** Append-only audit log of every scan attempt. */
export const checkins = pgTable(
  "checkins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    ticketId: uuid("ticket_id").references(() => tickets.id, { onDelete: "set null" }),
    staffUserId: uuid("staff_user_id").references(() => users.id, { onDelete: "set null" }),
    result: checkinResult("result").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("checkins_event_idx").on(t.eventId, t.createdAt)],
);

/** Every processed payment webhook, keyed by the provider's event id (dedupe). */
export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  provider: paymentProvider("provider").notNull(),
  type: text("type").notNull(),
  receivedAt: ts("received_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type Event = typeof events.$inferSelect;
export type TicketType = typeof ticketTypes.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;
