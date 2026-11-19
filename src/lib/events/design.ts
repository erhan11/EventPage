import type { CSSProperties } from "react";
import type { ArtStyle, EventDesign, ThemeId, TypographyId } from "./types";

export interface ThemePreset {
  id: ThemeId;
  name: string;
  mood: string;
  background: string;
  foreground: string;
  accent: string;
  typography: TypographyId;
  art: ArtStyle;
  /** Whether the palette is a dark scheme (affects grain blend + chrome). */
  dark: boolean;
}

export const THEMES: Record<ThemeId, ThemePreset> = {
  afterhours: {
    id: "afterhours",
    name: "Afterhours",
    mood: "Club darkness, acid accents",
    background: "#08080a",
    foreground: "#f2f1ec",
    accent: "#d4ff3a",
    typography: "grotesk",
    art: "waves",
    dark: true,
  },
  littoral: {
    id: "littoral",
    name: "Littoral",
    mood: "Sun-bleached beach editorial",
    background: "#f1e8d6",
    foreground: "#1d1a16",
    accent: "#ff5a36",
    typography: "editorial",
    art: "orbit",
    dark: false,
  },
  warehouse: {
    id: "warehouse",
    name: "Warehouse",
    mood: "Raw concrete, signal orange",
    background: "#e7e6e1",
    foreground: "#0d0d0d",
    accent: "#ff3b00",
    typography: "brutal",
    art: "grid",
    dark: false,
  },
  aurora: {
    id: "aurora",
    name: "Aurora",
    mood: "Festival dusk, soft gradients",
    background: "#0c0a1f",
    foreground: "#efeaff",
    accent: "#9d8bff",
    typography: "techno",
    art: "mesh",
    dark: true,
  },
  chrome: {
    id: "chrome",
    name: "Chrome",
    mood: "Monochrome, minimal techno",
    background: "#000000",
    foreground: "#e9e9e9",
    accent: "#ffffff",
    typography: "modern",
    art: "orbit",
    dark: true,
  },
};

export interface TypographyPreset {
  id: TypographyId;
  name: string;
  /** CSS font-family stacks referencing next/font variables. */
  display: string;
  body: string;
  mono: string;
  displayWeight: number;
  displayTracking: string;
  displayCase: "none" | "uppercase";
  displayStyle: "normal" | "italic";
}

export const TYPOGRAPHY: Record<TypographyId, TypographyPreset> = {
  editorial: {
    id: "editorial",
    name: "Editorial",
    display: "var(--font-instrument-serif), Georgia, serif",
    body: "var(--font-inter-tight), system-ui, sans-serif",
    mono: "var(--font-jetbrains), ui-monospace, monospace",
    displayWeight: 400,
    displayTracking: "-0.035em",
    displayCase: "none",
    displayStyle: "italic",
  },
  grotesk: {
    id: "grotesk",
    name: "Wide Grotesk",
    display: "var(--font-unbounded), system-ui, sans-serif",
    body: "var(--font-inter-tight), system-ui, sans-serif",
    mono: "var(--font-jetbrains), ui-monospace, monospace",
    displayWeight: 700,
    displayTracking: "-0.04em",
    displayCase: "uppercase",
    displayStyle: "normal",
  },
  brutal: {
    id: "brutal",
    name: "Brutalist",
    display: "var(--font-archivo-black), Impact, sans-serif",
    body: "var(--font-space-mono), ui-monospace, monospace",
    mono: "var(--font-space-mono), ui-monospace, monospace",
    displayWeight: 400,
    displayTracking: "-0.05em",
    displayCase: "uppercase",
    displayStyle: "normal",
  },
  techno: {
    id: "techno",
    name: "Techno",
    display: "var(--font-syne), system-ui, sans-serif",
    body: "var(--font-inter-tight), system-ui, sans-serif",
    mono: "var(--font-jetbrains), ui-monospace, monospace",
    displayWeight: 800,
    displayTracking: "-0.04em",
    displayCase: "none",
    displayStyle: "normal",
  },
  modern: {
    id: "modern",
    name: "Modern",
    display: "var(--font-bricolage), system-ui, sans-serif",
    body: "var(--font-inter-tight), system-ui, sans-serif",
    mono: "var(--font-jetbrains), ui-monospace, monospace",
    displayWeight: 600,
    displayTracking: "-0.055em",
    displayCase: "none",
    displayStyle: "normal",
  },
};

export function designFromTheme(themeId: ThemeId, seed = 7): EventDesign {
  const t = THEMES[themeId];
  return {
    theme: t.id,
    typography: t.typography,
    background: t.background,
    foreground: t.foreground,
    accent: t.accent,
    art: t.art,
    artSeed: seed,
    heroImageUrl: null,
  };
}

const HEX = /^#[0-9a-f]{6}$/i;
export const isHex = (v: string) => HEX.test(v);

/** Relative luminance (WCAG) for contrast-aware text on accent surfaces. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Pick black or white text for an accent-filled surface. */
export const onAccent = (accent: string) => (luminance(accent) > 0.4 ? "#0a0a0a" : "#ffffff");

export function isDarkColor(hex: string) {
  return luminance(hex) < 0.2;
}

/** CSS custom properties consumed by the event page components. */
export function designVars(d: EventDesign): CSSProperties {
  const typo = TYPOGRAPHY[d.typography];
  return {
    "--ev-bg": d.background,
    "--ev-fg": d.foreground,
    "--ev-accent": d.accent,
    "--ev-on-accent": onAccent(d.accent),
    "--ev-muted": `color-mix(in oklab, ${d.foreground} 58%, ${d.background})`,
    "--ev-line": `color-mix(in oklab, ${d.foreground} 16%, ${d.background})`,
    "--ev-surface": `color-mix(in oklab, ${d.foreground} 5%, ${d.background})`,
    "--ev-font-display": typo.display,
    "--ev-font-body": typo.body,
    "--ev-font-mono": typo.mono,
    "--ev-display-weight": String(typo.displayWeight),
    "--ev-display-tracking": typo.displayTracking,
    "--ev-display-case": typo.displayCase,
    "--ev-display-style": typo.displayStyle,
    colorScheme: isDarkColor(d.background) ? "dark" : "light",
  } as CSSProperties;
}
