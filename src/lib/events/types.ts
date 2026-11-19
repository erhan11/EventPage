export type ThemeId = "afterhours" | "littoral" | "warehouse" | "aurora" | "chrome";
export type TypographyId = "editorial" | "grotesk" | "brutal" | "techno" | "modern";
export type ArtStyle = "waves" | "orbit" | "mesh" | "grid" | "image";

export interface EventDesign {
  theme: ThemeId;
  typography: TypographyId;
  /** Overrides on top of the theme palette. */
  background: string;
  foreground: string;
  accent: string;
  art: ArtStyle;
  artSeed: number;
  heroImageUrl: string | null;
}

export interface LineupEntry {
  id: string;
  name: string;
  /** e.g. "Headliner", "Live", "b2b" */
  billing: string;
  genre: string;
  /** "23:00" in event local time */
  time: string;
}

export interface ScheduleEntry {
  id: string;
  time: string;
  label: string;
}

export interface SocialLinks {
  instagram?: string;
  soundcloud?: string;
  residentAdvisor?: string;
  website?: string;
}
