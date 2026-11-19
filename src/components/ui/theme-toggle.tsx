"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

type Mode = "system" | "light" | "dark";
const KEY = "ep-theme";
const listeners = new Set<() => void>();

function read(): Mode {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

function write(m: Mode) {
  const root = document.documentElement;
  try {
    if (m === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, m);
  } catch {}
  if (m === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", m);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, read, () => "system" as Mode);
  const opts: [Mode, typeof Sun, string][] = [
    ["light", Sun, "Light theme"],
    ["system", Monitor, "System theme"],
    ["dark", Moon, "Dark theme"],
  ];
  return (
    <div role="radiogroup" aria-label="Colour theme" className="flex rounded-full border border-line p-0.5">
      {opts.map(([m, Icon, label]) => (
        <button
          key={m}
          role="radio"
          aria-checked={mode === m}
          aria-label={label}
          onClick={() => write(m)}
          className={`grid h-7 w-7 place-items-center rounded-full transition-colors ${mode === m ? "bg-fg text-bg" : "text-muted hover:text-fg"}`}
        >
          <Icon size={13} />
        </button>
      ))}
    </div>
  );
}
