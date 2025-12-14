export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "error" | "success";
  children: React.ReactNode;
}) {
  const cls =
    tone === "error"
      ? "border-[rgba(209,31,42,0.30)] bg-[rgba(209,31,42,0.14)] text-red-100"
      : tone === "success"
        ? "border-[rgba(25,192,96,0.25)] bg-[rgba(25,192,96,0.12)] text-[color:var(--foreground)]"
        : "border-[color:var(--border)] bg-[rgba(255,255,255,0.03)] text-[color:var(--foreground)]";

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${cls}`}>
      {children}
    </div>
  );
}
