import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-fg text-bg hover:bg-fg/90",
  secondary: "border border-line-strong bg-raised text-fg hover:border-fg/40",
  ghost: "text-fg hover:bg-surface",
  danger: "border border-danger/40 text-danger hover:bg-danger/10",
};
const base =
  "inline-flex items-center justify-center gap-2 rounded-full px-4 h-10 text-sm font-medium tracking-tight transition-all duration-200 ease-[var(--ease-out-expo)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 select-none";

export function Button({ variant = "primary", className = "", ...p }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button {...p} className={`${base} ${variants[variant]} ${className}`} />;
}

export function ButtonLink({ variant = "primary", className = "", ...p }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link {...p} className={`${base} ${variants[variant]} ${className}`} />;
}

export function AccentButton({ className = "", ...p }: ComponentProps<"button">) {
  return <button {...p} className={`${base} h-12 bg-accent px-6 text-accent-ink hover:brightness-95 ${className}`} />;
}

export function Field({
  label,
  hint,
  error,
  children,
  className = "",
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`grid gap-1.5 ${className}`}>
      <span className="label-mono text-muted">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-muted">{hint}</span>}
      {error && <span className="text-xs text-danger">{error}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-line bg-raised px-3.5 h-11 text-[15px] text-fg outline-none transition-[border-color,box-shadow] placeholder:text-muted/70 focus:border-fg/50 focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--fg)_8%,transparent)]";

export function Input({ className = "", ...p }: ComponentProps<"input">) {
  return <input {...p} className={`${inputCls} ${className}`} />;
}

export function Textarea({ className = "", ...p }: ComponentProps<"textarea">) {
  return <textarea {...p} className={`${inputCls} h-auto py-3 leading-relaxed ${className}`} />;
}

export function Select({ className = "", ...p }: ComponentProps<"select">) {
  return <select {...p} className={`${inputCls} appearance-none bg-[length:12px] bg-[right_14px_center] bg-no-repeat pr-9 ${className}`} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23888' stroke-width='1.6' fill='none'/%3E%3C/svg%3E\")" }} />;
}

export function Card({ className = "", ...p }: ComponentProps<"div">) {
  return <div {...p} className={`rounded-3xl border border-line bg-raised ${className}`} />;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn" | "danger" | "accent"; children: ReactNode }) {
  const tones = {
    neutral: "border-line-strong text-muted",
    ok: "border-ok/40 text-ok",
    warn: "border-warn/40 text-warn",
    danger: "border-danger/40 text-danger",
    accent: "border-transparent bg-accent text-accent-ink",
  };
  return <span className={`label-mono inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] ${tones[tone]}`}>{children}</span>;
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl border border-danger/30 bg-danger/8 px-3.5 py-2.5 text-sm text-danger">
      {message}
    </p>
  );
}
