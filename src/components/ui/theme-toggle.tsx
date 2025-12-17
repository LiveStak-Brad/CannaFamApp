"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("theme") as Theme | null;
    if (stored) {
      setTheme(stored);
      applyTheme(stored);
    }
  }, []);

  const applyTheme = (t: Theme) => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");

    if (t === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (!prefersDark) {
        root.classList.add("light");
      }
    } else if (t === "light") {
      root.classList.add("light");
    } else {
      root.classList.add("dark");
    }
  };

  const cycleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    applyTheme(next);
  };

  if (!mounted) {
    return (
      <button
        className="inline-flex items-center justify-center rounded-xl px-2 py-1.5 text-xs sm:px-3 sm:py-2 sm:text-sm font-semibold transition bg-[color:var(--card)] text-[color:var(--foreground)] border border-[color:var(--border)] hover:border-[color:var(--accent)]"
        aria-label="Toggle theme"
      >
        <span className="w-4 h-4" />
      </button>
    );
  }

  const icon = theme === "dark" ? "🌙" : theme === "light" ? "☀️" : "🖥️";
  const label = theme === "dark" ? "Dark" : theme === "light" ? "Light" : "Auto";

  return (
    <button
      onClick={cycleTheme}
      className="inline-flex items-center justify-center gap-1 rounded-xl px-2 py-1.5 text-xs sm:px-3 sm:py-2 sm:text-sm font-semibold transition active:translate-y-[1px] bg-[color:var(--card)] text-[color:var(--foreground)] border border-[color:var(--border)] hover:border-[color:var(--accent)]"
      aria-label={`Current theme: ${label}. Click to change.`}
      title={`Theme: ${label}`}
    >
      <span>{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
