"use client";

import { useEffect, useRef } from "react";

export function DropdownMenu({
  trigger,
  children,
  className,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // Close if clicking outside
      if (!details.contains(target)) {
        details.open = false;
        return;
      }

      // Close if clicking a link or button inside the dropdown (not the summary)
      const summary = details.querySelector("summary");
      if (summary?.contains(target)) return;

      if (
        target.closest("a") ||
        target.closest("button") ||
        target.closest("[role='menuitem']")
      ) {
        details.open = false;
      }
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return (
    <details ref={detailsRef} className={`relative ${className ?? ""}`}>
      {trigger}
      {children}
    </details>
  );
}
