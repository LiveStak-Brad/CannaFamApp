"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export function useThemeState() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("theme") as Theme | null;
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
      applyTheme(stored);
    }
  }, []);

  const applyTheme = (t: Theme) => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    if (t === "light") {
      root.classList.add("light");
    } else {
      root.classList.add("dark");
    }
  };

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    applyTheme(next);
  };

  return { theme, toggleTheme, mounted };
}

export function ThemeToggleMenuItem({ className }: { className?: string }) {
  const { theme, toggleTheme, mounted } = useThemeState();

  if (!mounted) {
    return (
      <button className={className} disabled>
        <span>🌙</span>
        <span>Loading...</span>
      </button>
    );
  }

  const icon = theme === "dark" ? "🌙" : "☀️";
  const label = theme === "dark" ? "Dark Mode" : "Light Mode";

  return (
    <button
      onClick={toggleTheme}
      className={className}
    >
      <span>{icon}</span>
      <span>{label}</span>
      <span className="ml-auto text-xs text-[color:var(--muted)]">Tap to switch</span>
    </button>
  );
}
