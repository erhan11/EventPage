import type { Metadata, Viewport } from "next";
// Self-hosted fonts (no third-party requests at build or run time). Browsers only
// download a face when it is actually used, so unused event themes cost nothing.
import "@fontsource-variable/inter-tight";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/unbounded";
import "@fontsource/archivo-black/400.css";
import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";
import "@fontsource-variable/syne";
import "@fontsource-variable/bricolage-grotesque";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "EventPage — Event pages & ticketing for electronic music", template: "%s · EventPage" },
  description:
    "Design an immersive event page, sell tickets, and run the door — built for clubs, DJs, beach parties and small festivals.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
    { media: "(prefers-color-scheme: light)", color: "#f4f2ec" },
  ],
};

// Applies the saved app theme before first paint (no flash).
const themeScript = `try{var t=localStorage.getItem("ep-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
