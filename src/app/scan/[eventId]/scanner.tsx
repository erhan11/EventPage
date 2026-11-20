"use client";

import { ArrowLeft, Camera, CameraOff, Keyboard, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ScanResult } from "@/lib/tickets/checkin";

type Totals = { checkedIn: number; issued: number };
type Shown = (ScanResult & { at: number }) | { outcome: "error"; message: string; at: number };

const OUTCOME = {
  admitted: { label: "Admit", bg: "#16c172", fg: "#03140b", vibrate: [60] },
  already_checked_in: { label: "Already used", bg: "#ffb02e", fg: "#1d1200", vibrate: [120, 80, 120] },
  void: { label: "Void ticket", bg: "#ff4433", fg: "#ffffff", vibrate: [300] },
  wrong_event: { label: "Wrong event", bg: "#ff4433", fg: "#ffffff", vibrate: [300] },
  invalid: { label: "Invalid", bg: "#ff4433", fg: "#ffffff", vibrate: [300] },
  error: { label: "Can't verify", bg: "#3a3a3d", fg: "#ffffff", vibrate: [200, 100, 200] },
} as const;

interface Detector {
  detect(src: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

export function Scanner({ eventId, title, accent, initialTotals, staffName }: { eventId: string; title: string; accent: string; initialTotals: Totals; staffName: string }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const busy = useRef(false);
  const lastCode = useRef<{ v: string; t: number }>({ v: "", t: 0 });
  const [camera, setCamera] = useState<"off" | "starting" | "on" | "denied" | "unsupported">("off");
  const [totals, setTotals] = useState(initialTotals);
  const [shown, setShown] = useState<Shown | null>(null);
  const [history, setHistory] = useState<Shown[]>([]);
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState("");
  const [online, setOnline] = useState(true);
  const [torch, setTorch] = useState(false);

  // Created inside a user gesture (start button / manual submit) so playback is allowed.
  const ensureAudio = useCallback(() => {
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor && !audioRef.current) audioRef.current = new Ctor();
    } catch {}
  }, []);

  /** Audible verdict for loud rooms: short high beep = in, long low buzz = stop. */
  const beep = useCallback((ok: boolean) => {
    const ctx = audioRef.current;
    if (!ctx) return;
    try {
      if (ctx.state === "suspended") void ctx.resume();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.type = ok ? "sine" : "square";
      o.frequency.value = ok ? 880 : 180;
      g.gain.setValueAtTime(0.12, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (ok ? 0.15 : 0.4));
      o.start();
      o.stop(ctx.currentTime + (ok ? 0.16 : 0.42));
    } catch {}
  }, []);

  const submit = useCallback(
    async (input: string) => {
      if (busy.current) return;
      const now = Date.now();
      if (input === lastCode.current.v && now - lastCode.current.t < 3500) return; // same QR still in frame
      lastCode.current = { v: input, t: now };
      busy.current = true;
      let r: Shown;
      try {
        const res = await fetch("/api/scan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ eventId, input }),
        });
        if (res.status === 401) {
          busy.current = false;
          router.push(`/login?next=/scan/${eventId}`);
          return;
        }
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
        const data = (await res.json()) as ScanResult;
        setTotals(data.totals);
        r = { ...data, at: now };
        setOnline(true);
      } catch (e) {
        // Never admit on failure — the server is the only source of truth.
        r = { outcome: "error", message: navigator.onLine ? (e as Error).message : "No connection", at: now };
        setOnline(navigator.onLine);
      }
      setShown(r);
      setHistory((h) => [r, ...h].slice(0, 12));
      beep(r.outcome === "admitted");
      try {
        navigator.vibrate?.(OUTCOME[r.outcome].vibrate as unknown as number[]);
      } catch {}
      setTimeout(
        () => {
          setShown((s) => (s?.at === r.at ? null : s));
          busy.current = false;
        },
        r.outcome === "admitted" ? 1400 : 2600,
      );
    },
    [eventId, router, beep],
  );

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamera("off");
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return setCamera("unsupported");
    ensureAudio();
    setCamera("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      setCamera("on");
    } catch {
      setCamera("denied");
    }
  }, [ensureAudio]);

  // Decode loop: native BarcodeDetector when available, jsQR fallback.
  useEffect(() => {
    if (camera !== "on") return;
    let raf = 0;
    let stopped = false;
    let detector: Detector | null = null;
    let jsQR: typeof import("jsqr").default | null = null;
    let last = 0;

    (async () => {
      const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      if (BD) {
        try {
          detector = new BD({ formats: ["qr_code"] });
        } catch {
          detector = null;
        }
      }
      if (!detector) jsQR = (await import("jsqr")).default;
      const loop = async (t: number) => {
        if (stopped) return;
        raf = requestAnimationFrame(loop);
        if (t - last < 110 || busy.current) return;
        last = t;
        const v = videoRef.current;
        if (!v || v.readyState < 2) return;
        try {
          if (detector) {
            const codes = await detector.detect(v);
            if (codes[0]?.rawValue) submit(codes[0].rawValue);
          } else if (jsQR) {
            const c = canvasRef.current!;
            const w = 480;
            const h = Math.round((v.videoHeight / v.videoWidth) * w) || 360;
            c.width = w;
            c.height = h;
            const ctx = c.getContext("2d", { willReadFrequently: true })!;
            ctx.drawImage(v, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            const res = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
            if (res?.data) submit(res.data);
          }
        } catch {
          /* frame decode errors are expected */
        }
      };
      raf = requestAnimationFrame(loop);
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [camera, submit]);

  useEffect(() => () => stop(), [stop]);

  // Keep the screen awake while scanning — a sleeping phone is a stalled door.
  useEffect(() => {
    if (camera !== "on") return;
    let sentinel: { release(): Promise<void> } | null = null;
    const nav = navigator as unknown as { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } };
    const acquire = () => nav.wakeLock?.request("screen").then((s) => void (sentinel = s)).catch(() => {});
    acquire();
    const onVis = () => {
      if (document.visibilityState === "visible") acquire();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      sentinel?.release().catch(() => {});
    };
  }, [camera]);

  // If camera permission was already granted, resume scanning without a tap.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await navigator.permissions?.query({ name: "camera" as PermissionName });
        if (!cancelled && status?.state === "granted") start();
      } catch {
        /* Safari has no "camera" permission name — the big start button remains. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [start]);

  // Keep totals fresh when several devices scan the same door.
  useEffect(() => {
    const id = setInterval(async () => {
      if (document.hidden) return;
      try {
        const r = await fetch(`/api/scan?eventId=${eventId}`, { cache: "no-store" });
        if (r.ok) {
          setTotals(await r.json());
          setOnline(true);
        }
      } catch {
        setOnline(false);
      }
    }, 15000);
    return () => clearInterval(id);
  }, [eventId]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {}
  };

  const pct = totals.issued ? Math.round((totals.checkedIn / totals.issued) * 100) : 0;
  const o = shown ? OUTCOME[shown.outcome] : null;

  return (
    <main className="fixed inset-0 flex flex-col bg-black text-white [color-scheme:dark]" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      {/* Header */}
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <Link href="/scan" className="grid h-10 w-10 place-items-center rounded-full bg-white/10" aria-label="Back to events">
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0 text-center">
          <div className="truncate text-[15px] font-semibold">{title}</div>
          <div className="label-mono flex items-center justify-center gap-1.5 text-[10px] text-white/50">
            <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-[#16c172]" : "bg-[#ff4433]"}`} />
            {online ? staffName : "Offline — scans can't be verified"}
          </div>
        </div>
        <button onClick={toggleTorch} disabled={camera !== "on"} className={`grid h-10 w-10 place-items-center rounded-full ${torch ? "bg-white text-black" : "bg-white/10"} disabled:opacity-30`} aria-label="Toggle flashlight" aria-pressed={torch}>
          <Zap size={17} />
        </button>
      </header>

      {/* Counter */}
      <section className="px-5 pt-2 pb-4" aria-label="Check-in totals">
        <div className="flex items-end justify-between">
          <div className="leading-none">
            <span className="text-[64px] font-semibold tracking-[-0.05em] tabular-nums" aria-live="polite">{totals.checkedIn}</span>
            <span className="ml-2 text-xl text-white/40 tabular-nums">/ {totals.issued}</span>
          </div>
          <span className="label-mono pb-2 text-white/50">{pct}% in</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, background: accent }} />
        </div>
      </section>

      {/* Viewfinder */}
      <section className="relative mx-4 flex-1 overflow-hidden rounded-[28px] bg-[#111]">
        <video ref={videoRef} playsInline muted className={`absolute inset-0 h-full w-full object-cover ${camera === "on" ? "" : "hidden"}`} />
        <canvas ref={canvasRef} className="hidden" />
        {camera === "on" ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="relative aspect-square w-[68%] max-w-[300px]" style={{ ["--scan-h" as string]: "100%" }}>
              {["top-0 left-0 border-t-4 border-l-4 rounded-tl-3xl", "top-0 right-0 border-t-4 border-r-4 rounded-tr-3xl", "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-3xl", "bottom-0 right-0 border-b-4 border-r-4 rounded-br-3xl"].map((c) => (
                <span key={c} className={`absolute h-12 w-12 border-white ${c}`} />
              ))}
              <span className="absolute inset-x-3 top-0 h-0.5 rounded-full" style={{ background: accent, boxShadow: `0 0 18px 4px ${accent}`, animation: "scanline 2.4s ease-in-out infinite" }} />
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 grid place-items-center p-8 text-center">
            <div>
              {camera === "denied" ? (
                <>
                  <CameraOff className="mx-auto" size={36} />
                  <p className="mt-4 text-white/70">Camera access was blocked. Allow it in your browser settings, or enter codes manually.</p>
                </>
              ) : camera === "unsupported" ? (
                <p className="text-white/70">This browser can&apos;t open the camera. Use manual entry below.</p>
              ) : (
                <button onClick={start} disabled={camera === "starting"} className="flex flex-col items-center gap-4">
                  <span className="grid h-24 w-24 place-items-center rounded-full text-black transition-transform active:scale-95" style={{ background: accent }}>
                    <Camera size={34} />
                  </span>
                  <span className="text-lg font-semibold">{camera === "starting" ? "Opening camera…" : "Start scanning"}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Result overlay */}
        {shown && o && (
          <button
            onClick={() => {
              setShown(null);
              busy.current = false;
            }}
            className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center"
            style={{ background: o.bg, color: o.fg, animation: "rise .25s var(--ease-out-expo) both" }}
            role="alert"
            aria-live="assertive"
          >
            <span className="text-[clamp(3rem,16vw,5.5rem)] leading-none font-bold tracking-[-0.05em] uppercase">{o.label}</span>
            {"ticket" in shown && shown.ticket && (
              <span className="mt-5 grid gap-1 text-lg">
                <span className="font-semibold">{shown.ticket.typeName}</span>
                <span className="opacity-80">{shown.ticket.holder}</span>
                <span className="font-mono text-sm tracking-[0.25em] opacity-70">{shown.ticket.code}</span>
                {shown.outcome === "already_checked_in" && shown.ticket.checkedInAt && (
                  <span className="mt-2 rounded-full bg-black/15 px-4 py-1.5 text-base font-semibold">
                    Scanned at {new Date(shown.ticket.checkedInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                )}
              </span>
            )}
            {shown.outcome === "error" && <span className="mt-4 opacity-80">{shown.message}. Do not admit — retry.</span>}
            <span className="label-mono mt-8 opacity-60">Tap to continue</span>
          </button>
        )}
      </section>

      {/* Manual entry + recent */}
      <section className="px-4 pt-3 pb-4">
        {manual ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ensureAudio();
              if (code.trim()) {
                lastCode.current = { v: "", t: 0 };
                submit(code.trim());
                setCode("");
              }
            }}
            className="flex gap-2"
          >
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="8-character code"
              aria-label="Ticket code"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={12}
              className="h-14 flex-1 rounded-2xl bg-white/10 px-4 font-mono text-lg tracking-[0.2em] outline-none placeholder:tracking-normal placeholder:text-white/40 focus:bg-white/15"
            />
            <button className="h-14 rounded-2xl px-5 font-semibold text-black" style={{ background: accent }}>
              Check
            </button>
          </form>
        ) : (
          <button onClick={() => setManual(true)} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white/10 font-medium">
            <Keyboard size={18} /> Enter code manually
          </button>
        )}
        {history.length > 0 && (
          <ul className="mt-3 flex gap-1.5 overflow-x-auto" aria-label="Recent scans">
            {history.map((h, i) => (
              <li key={h.at + i} className="h-1.5 w-6 shrink-0 rounded-full" style={{ background: OUTCOME[h.outcome].bg }} title={OUTCOME[h.outcome].label} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
