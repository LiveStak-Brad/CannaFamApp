export type VipTier = "bronze" | "silver" | "gold" | "diamond";

/** Tier color mapping for text/name coloring */
export const VIP_TIER_COLORS: Record<VipTier, string> = {
  bronze: "#c67a3d",
  silver: "#b8c1d1",
  gold: "#e0b84c",
  diamond: "#4cc9f0",
};

export function VipBadge({
  tier,
  className,
}: {
  tier?: VipTier | null;
  className?: string;
}) {
  if (!tier) return null;

  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold leading-none";

  const cls =
    tier === "bronze"
      ? "border-[rgba(198,122,61,0.7)] bg-[rgba(198,122,61,0.25)] text-white"
      : tier === "silver"
        ? "border-[rgba(184,193,209,0.7)] bg-[rgba(184,193,209,0.22)] text-white"
        : tier === "gold"
          ? "border-[rgba(224,184,76,0.75)] bg-[rgba(224,184,76,0.25)] text-white"
          : "border-[rgba(76,201,240,0.7)] bg-gradient-to-r from-[rgba(45,212,191,0.25)] to-[rgba(56,189,248,0.22)] text-white";

  return <span className={`${base} ${cls}${className ? ` ${className}` : ""}`}>VIP</span>;
}
