export type VipTier = "bronze" | "silver" | "gold" | "diamond";

export function VipBadge({
  tier,
  className,
}: {
  tier?: VipTier | null;
  className?: string;
}) {
  if (!tier) return null;

  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none";

  const cls =
    tier === "bronze"
      ? "border-[rgba(198,122,61,0.55)] bg-[rgba(198,122,61,0.16)] text-[rgba(255,216,180,0.95)]"
      : tier === "silver"
        ? "border-[rgba(184,193,209,0.55)] bg-[rgba(184,193,209,0.14)] text-[rgba(230,236,245,0.92)]"
        : tier === "gold"
          ? "border-[rgba(224,184,76,0.6)] bg-[rgba(224,184,76,0.16)] text-[rgba(255,238,190,0.95)]"
          : "border-[rgba(76,201,240,0.55)] bg-gradient-to-r from-[rgba(45,212,191,0.16)] to-[rgba(56,189,248,0.14)] text-[rgba(198,246,255,0.95)]";

  return <span className={`${base} ${cls}${className ? ` ${className}` : ""}`}>VIP</span>;
}
