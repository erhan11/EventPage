import { ArrowRight, QrCode, Sparkles, Ticket } from "lucide-react";
import Link from "next/link";
import { EventView } from "@/components/event/event-view";
import { HeroArt } from "@/components/event/hero-art";
import { Logo } from "@/components/ui/brand";
import { ButtonLink } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { getCurrentUser } from "@/lib/auth/session";
import { designVars, THEMES } from "@/lib/events/design";
import { DEMO_EVENT } from "@/lib/events/demo";

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <div className="overflow-x-clip">
      <header className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-5 sm:px-8">
        <Logo />
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {user ? (
            <ButtonLink href="/dashboard">Dashboard</ButtonLink>
          ) : (
            <>
              <Link href="/login" className="hidden px-2 text-sm text-muted hover:text-fg sm:inline">
                Sign in
              </Link>
              <ButtonLink href="/signup">Start free</ButtonLink>
            </>
          )}
        </div>
      </header>

      <main id="main">
        <section className="mx-auto grid max-w-[1400px] gap-12 px-5 pt-14 pb-20 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:pt-24">
          <div>
            <span className="label-mono inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" /> For clubs, DJs, beach parties & small festivals
            </span>
            <h1 className="mt-8 text-[clamp(3.25rem,8vw,7.75rem)] leading-[0.88] font-semibold tracking-[-0.055em]">
              Nights deserve <span className="display-serif font-normal italic">better</span> pages.
            </h1>
            <p className="mt-8 max-w-xl text-lg leading-relaxed text-muted sm:text-xl">
              Design an immersive event page in minutes, sell tickets with secure checkout, and run the door from your phone. One link
              from announcement to the last track.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <ButtonLink href="/signup" className="h-12 bg-accent px-6 text-accent-ink hover:bg-accent hover:brightness-95">
                Create your event <ArrowRight size={16} />
              </ButtonLink>
              <ButtonLink href="/e/neon-tide" variant="secondary" className="h-12 px-6">
                See a live page
              </ButtonLink>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-10 -z-10 rounded-full bg-accent/20 blur-3xl" aria-hidden />
            <div className="relative mx-auto aspect-[9/17] w-[min(100%,340px)] overflow-hidden rounded-[46px] border-[10px] border-[#111] bg-black shadow-[0_60px_120px_-40px_rgba(0,0,0,0.55)] lg:rotate-[2deg]">
              <div className="pointer-events-none h-full overflow-hidden" aria-hidden inert>
                <EventView event={DEMO_EVENT} mode="preview" />
              </div>
            </div>
            <div className="absolute top-[18%] -left-2 hidden rotate-[-4deg] rounded-2xl border border-line bg-raised px-4 py-3 shadow-[var(--shadow)] sm:block lg:-left-10">
              <div className="label-mono text-muted">Tonight</div>
              <div className="text-2xl font-semibold tabular">412 / 450</div>
              <div className="text-xs text-muted">checked in</div>
            </div>
          </div>
        </section>

        <section className="border-y border-line bg-raised" aria-labelledby="pillars">
          <h2 id="pillars" className="sr-only">What EventPage does</h2>
          <div className="mx-auto grid max-w-[1400px] divide-y divide-line px-5 sm:px-8 md:grid-cols-3 md:divide-x md:divide-y-0">
            {[
              [Sparkles, "01", "Design", "Five art-directed themes, real typography, generative hero art or your own. Live preview on phone and desktop."],
              [Ticket, "02", "Sell", "Early Bird, GA and VIP tiers with hard inventory limits. Secure checkout — tickets issue only after verified payment."],
              [QrCode, "03", "Scan", "Signed QR tickets, a phone scanner for your door team, and atomic check-in so no ticket gets in twice."],
            ].map(([Icon, n, t, d]) => {
              const I = Icon as typeof Sparkles;
              return (
                <div key={n as string} className="py-10 md:px-8 md:first:pl-0 md:last:pr-0">
                  <div className="flex items-center justify-between">
                    <I size={20} />
                    <span className="label-mono text-muted">{n as string}</span>
                  </div>
                  <h3 className="display-serif mt-10 text-5xl italic">{t as string}</h3>
                  <p className="mt-4 max-w-sm leading-relaxed text-muted">{d as string}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mx-auto max-w-[1400px] px-5 py-24 sm:px-8" aria-labelledby="themes-h">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 id="themes-h" className="text-[clamp(2.5rem,5vw,4.5rem)] leading-[0.95] font-semibold tracking-[-0.045em]">
              A mood for <span className="display-serif font-normal italic">every</span> night.
            </h2>
            <p className="max-w-sm text-muted">Start from a theme, then make it yours — colours, type, artwork and every word.</p>
          </div>
          <ul className="mt-12 grid grid-cols-2 gap-3 md:grid-cols-5">
            {Object.values(THEMES).map((t, i) => (
              <li
                key={t.id}
                style={designVars({ theme: t.id, typography: t.typography, background: t.background, foreground: t.foreground, accent: t.accent, art: t.art, artSeed: 31 + i * 17, heroImageUrl: null })}
                className="group relative aspect-[3/4] overflow-hidden rounded-3xl bg-ev-bg text-ev-fg"
              >
                <div className="absolute inset-0 transition-transform duration-1000 ease-[var(--ease-out-expo)] group-hover:scale-110">
                  <HeroArt style={t.art} seed={31 + i * 17} />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--ev-bg)] via-transparent to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <div className="ev-display text-3xl">{t.name}</div>
                  <div className="mt-1 font-ev-mono text-[10px] tracking-[0.14em] text-ev-muted uppercase">{t.mood}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-5 py-8 sm:px-8">
          <Logo />
          <span className="label-mono text-muted">Made for the dancefloor</span>
        </div>
      </footer>
    </div>
  );
}
