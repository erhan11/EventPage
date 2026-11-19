import type { ArtStyle } from "@/lib/events/types";

/**
 * Procedural, seed-driven hero artwork. Pure SVG — zero network cost, crisp at any size,
 * and recolours instantly from the theme variables.
 */

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function Waves({ seed }: { seed: number }) {
  const rand = rng(seed);
  const lines = 34;
  const freqA = 1.2 + rand() * 2.4;
  const freqB = 3 + rand() * 5;
  const phase = rand() * Math.PI * 2;
  const peak = 0.3 + rand() * 0.4;
  const paths: { d: string; accent: boolean; o: number }[] = [];
  for (let i = 0; i < lines; i++) {
    const y0 = 160 + i * 22;
    let d = "";
    for (let x = 0; x <= 1600; x += 20) {
      const nx = x / 1600;
      const env = Math.exp(-((nx - peak) ** 2) / 0.05) * (0.4 + (i / lines) * 0.9);
      const y =
        y0 -
        env * 160 * (0.6 + 0.4 * Math.sin(nx * Math.PI * freqA + phase + i * 0.22)) -
        Math.sin(nx * Math.PI * freqB + i * 0.5) * 6;
      d += `${x === 0 ? "M" : "L"}${x} ${r2(y)}`;
    }
    paths.push({ d, accent: i === Math.floor(lines * 0.62), o: 0.12 + (i / lines) * 0.5 });
  }
  return (
    <svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden>
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill="none"
          stroke={p.accent ? "var(--ev-accent)" : "var(--ev-fg)"}
          strokeOpacity={p.accent ? 1 : p.o}
          strokeWidth={p.accent ? 3 : 1.25}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

function Orbit({ seed }: { seed: number }) {
  const rand = rng(seed);
  const cx = 980 + rand() * 300;
  const cy = 420 + rand() * 120;
  const R = 300 + rand() * 80;
  const bands = 9;
  return (
    <svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden>
      <defs>
        <mask id={`sun-${seed}`}>
          <rect width="1600" height="1000" fill="white" />
          {Array.from({ length: bands }, (_, i) => {
            const y = cy + R * 0.1 + i * ((R * 0.95) / bands);
            return <rect key={i} x="0" y={r2(y)} width="1600" height={r2(2 + i * 2.6)} fill="black" />;
          })}
        </mask>
      </defs>
      {Array.from({ length: 14 }, (_, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={R + 40 + i * 46}
          fill="none"
          stroke="var(--ev-fg)"
          strokeOpacity={0.16 - i * 0.009}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <circle cx={cx} cy={cy} r={R} fill="var(--ev-accent)" mask={`url(#sun-${seed})`} />
      <line x1="0" x2="1600" y1={cy + R + 1} y2={cy + R + 1} stroke="var(--ev-fg)" strokeOpacity="0.35" />
    </svg>
  );
}

function Mesh({ seed }: { seed: number }) {
  const rand = rng(seed);
  const blobs = Array.from({ length: 4 }, (_, i) => ({
    cx: 300 + rand() * 1000,
    cy: 200 + rand() * 600,
    r: 260 + rand() * 260,
    hue: i * 38 - 40,
    o: 0.55 + rand() * 0.35,
  }));
  return (
    <svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden>
      <defs>
        <filter id={`blur-${seed}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="90" />
        </filter>
      </defs>
      <g filter={`url(#blur-${seed})`} className="animate-drift" style={{ transformOrigin: "50% 50%" }}>
        {blobs.map((b, i) => (
          <circle
            key={i}
            cx={b.cx}
            cy={b.cy}
            r={b.r}
            fill="var(--ev-accent)"
            opacity={b.o}
            style={{ filter: `hue-rotate(${b.hue}deg)` }}
          />
        ))}
      </g>
    </svg>
  );
}

function Grid({ seed }: { seed: number }) {
  const rand = rng(seed);
  const horizon = 520 + rand() * 80;
  const vx = 600 + rand() * 600;
  const rows = 16;
  return (
    <svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden>
      {Array.from({ length: 33 }, (_, i) => {
        const x = -1600 + i * 150;
        return (
          <line key={`v${i}`} x1={vx} y1={horizon} x2={x} y2={1000} stroke="var(--ev-fg)" strokeOpacity="0.28" vectorEffect="non-scaling-stroke" />
        );
      })}
      {Array.from({ length: rows }, (_, i) => {
        const t = (i + 1) / rows;
        const y = horizon + (1000 - horizon) * t * t;
        return <line key={`h${i}`} x1="0" x2="1600" y1={r2(y)} y2={r2(y)} stroke="var(--ev-fg)" strokeOpacity={0.12 + t * 0.3} vectorEffect="non-scaling-stroke" />;
      })}
      <rect x="0" y={horizon - 6} width="1600" height="12" fill="var(--ev-accent)" />
      {Array.from({ length: 5 }, (_, i) => (
        <rect key={`b${i}`} x={vx - 480 + i * 210 + rand() * 40} y={horizon - 120 - rand() * 220} width={18 + rand() * 40} height={400} fill="var(--ev-fg)" opacity={0.06 + rand() * 0.08} />
      ))}
    </svg>
  );
}

export function HeroArt({ style, seed, imageUrl }: { style: ArtStyle; seed: number; imageUrl?: string | null }) {
  if (style === "image" && imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- user-uploaded art of arbitrary origin/size
      <img src={imageUrl} alt="" className="h-full w-full object-cover" fetchPriority="high" decoding="async" />
    );
  }
  switch (style) {
    case "orbit":
      return <Orbit seed={seed} />;
    case "mesh":
      return <Mesh seed={seed} />;
    case "grid":
      return <Grid seed={seed} />;
    default:
      return <Waves seed={seed} />;
  }
}
