import { designFromTheme } from "./design";
import type { EventViewModel } from "./view";

/** Static sample used by the marketing page (no database access). */
export const DEMO_EVENT: EventViewModel = {
  id: "00000000-0000-4000-8000-000000000000",
  slug: "demo",
  orgName: "Nachtfalter Collective",
  title: "Tidal Hours",
  tagline: "Sunset to sunrise on the dunes. Deep house, minimal, and one very long closing set.",
  description: "",
  startsAt: "2027-07-17T17:00:00.000Z",
  endsAt: "2027-07-18T04:00:00.000Z",
  timezone: "Europe/Lisbon",
  venueName: "Praia do Norte",
  venueAddress: "",
  city: "Comporta",
  country: "Portugal",
  currency: "EUR",
  design: designFromTheme("littoral", 404),
  lineup: [
    { id: "a", name: "Mira Sol", billing: "Sunset set", genre: "Deep house", time: "19:00" },
    { id: "b", name: "Oskar Brandt", billing: "Headliner", genre: "Minimal", time: "23:00" },
    { id: "c", name: "Lua Negra", billing: "Closing", genre: "Melodic", time: "02:30" },
  ],
  schedule: [],
  socials: {},
  status: "published",
  tickets: [],
};
