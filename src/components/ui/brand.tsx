import Link from "next/link";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`group inline-flex items-center gap-2.5 ${className}`} aria-label="EventPage home">
      <span className="relative grid h-7 w-7 place-items-center overflow-hidden rounded-[9px] bg-fg">
        <span className="absolute h-[160%] w-[3px] rotate-[24deg] bg-accent transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:translate-x-2" />
        <span className="absolute h-[160%] w-[3px] translate-x-[-6px] rotate-[24deg] bg-bg/50" />
      </span>
      <span className="text-[17px] font-semibold tracking-[-0.03em]">
        Event<span className="display-serif text-[19px] italic">page</span>
      </span>
    </Link>
  );
}
