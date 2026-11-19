/**
 * Seeds a demo organizer, a published event and a door-staff account.
 * Credentials are written to .seed-credentials.local (gitignored), never printed.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

async function main() {
  const { sql } = await import("drizzle-orm");
  const { db } = await import("../src/lib/db");
  const s = await import("../src/lib/db/schema");
  const { hashPassword } = await import("../src/lib/auth/password");
  const { designFromTheme } = await import("../src/lib/events/design");

  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.events).where(sql`slug = 'neon-tide'`);
  if (n > 0) {
    console.log("Seed data already present (event 'neon-tide'). Nothing to do.");
    process.exit(0);
  }

  const organizerPw = randomBytes(9).toString("base64url");
  const staffPw = randomBytes(9).toString("base64url");

  const [owner] = await db.insert(s.users).values({ email: "organizer@eventpage.test", name: "Alex Rivera", passwordHash: await hashPassword(organizerPw) }).returning();
  const [staff] = await db.insert(s.users).values({ email: "door@eventpage.test", name: "Sam Door", passwordHash: await hashPassword(staffPw) }).returning();
  const [org] = await db.insert(s.organizations).values({ name: "Nachtfalter Collective", slug: "nachtfalter" }).returning();
  await db.insert(s.memberships).values([
    { userId: owner.id, orgId: org.id, role: "owner" },
    { userId: staff.id, orgId: org.id, role: "staff" },
  ]);

  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 16);
  start.setUTCHours(21, 0, 0, 0);
  const [ev] = await db
    .insert(s.events)
    .values({
      orgId: org.id,
      slug: "neon-tide",
      status: "published",
      publishedAt: new Date(),
      title: "Neon Tide",
      tagline: "Nine hours of hypnotic techno in a decommissioned power station.",
      description:
        "Neon Tide returns to the turbine hall for its fourth chapter. One room, one Funktion-One rig, and a lineup built for the long haul — from slow-burning dub techno at doors to peak-time acid after three.\n\nNo phones on the floor: we sticker cameras at the door. Come early, stay late, look after each other.",
      startsAt: start,
      endsAt: new Date(start.getTime() + 9 * 36e5),
      timezone: "Europe/Berlin",
      venueName: "Kraftwerk Halle",
      venueAddress: "Köpenicker Str. 70",
      city: "Berlin",
      country: "Germany",
      capacity: 600,
      currency: "EUR",
      design: designFromTheme("afterhours", 2718),
      lineup: [
        { id: "l1", name: "Vera Kollek", billing: "Headliner", genre: "Hypnotic techno", time: "02:00" },
        { id: "l2", name: "Ondes Martenot", billing: "Live", genre: "Modular", time: "00:30" },
        { id: "l3", name: "Kasimir b2b Noor", billing: "b2b", genre: "Acid", time: "04:00" },
        { id: "l4", name: "Selin Ay", billing: "Opening", genre: "Dub techno", time: "22:00" },
      ],
      schedule: [
        { id: "s1", time: "22:00", label: "Doors" },
        { id: "s2", time: "01:00", label: "Last entry" },
        { id: "s3", time: "06:00", label: "Lights up" },
      ],
      socials: { instagram: "https://instagram.com/", residentAdvisor: "https://ra.co/" },
    })
    .returning();
  await db.insert(s.ticketTypes).values([
    { eventId: ev.id, name: "Early Bird", tier: "early_bird", priceCents: 1800, capacity: 150, sold: 0, sort: 0, description: "First release. Gone when it's gone." },
    { eventId: ev.id, name: "General Admission", tier: "general", priceCents: 2600, capacity: 400, sort: 1 },
    { eventId: ev.id, name: "VIP", tier: "vip", priceCents: 5500, capacity: 40, sort: 2, description: "Fast-lane entry, balcony and cloakroom." },
    { eventId: ev.id, name: "Guest List", tier: "free", priceCents: 0, capacity: 10, sort: 3, maxPerOrder: 2, isActive: true, description: "Free entry before 23:00." },
  ]);
  await db.insert(s.eventStaff).values({ eventId: ev.id, userId: staff.id });

  const credPath = process.env.SEED_CREDENTIALS_PATH ?? ".seed-credentials.local";
  writeFileSync(
    credPath,
    `# Local demo accounts (development only)\norganizer@eventpage.test  ${organizerPw}\ndoor@eventpage.test       ${staffPw}\n`,
    { mode: 0o600 },
  );
  console.log("✓ Seeded 'Neon Tide' → /e/neon-tide");
  console.log(`✓ Demo logins written to ${credPath}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
