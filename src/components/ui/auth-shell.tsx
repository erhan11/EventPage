import { HeroArt } from "@/components/event/hero-art";
import { designVars, designFromTheme } from "@/lib/events/design";
import { Logo } from "./brand";

export function AuthShell({ title, kicker, children }: { title: React.ReactNode; kicker: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <aside
        style={designVars(designFromTheme("afterhours", 23))}
        className="grain relative hidden overflow-hidden bg-ev-bg text-ev-fg lg:flex lg:flex-col lg:justify-between lg:p-12"
      >
        <div className="absolute inset-0 opacity-90">
          <HeroArt style="waves" seed={23} />
        </div>
        <span className="relative font-ev-mono text-[11px] tracking-[0.2em] uppercase">EventPage / for promoters</span>
        <div className="relative">
          <p className="display-serif max-w-[11ch] text-[5.5rem] italic">The night starts with the page.</p>
          <p className="mt-6 max-w-sm font-ev-mono text-xs leading-relaxed tracking-[0.08em] text-ev-muted uppercase">
            Design · Sell · Scan — one tool from announcement to the last track.
          </p>
        </div>
      </aside>
      <section className="flex flex-col px-6 py-8 sm:px-12">
        <Logo />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <span className="label-mono text-muted">{kicker}</span>
          <h1 className="mt-3 mb-8 text-4xl font-semibold tracking-[-0.04em]">{title}</h1>
          {children}
        </div>
      </section>
    </main>
  );
}
