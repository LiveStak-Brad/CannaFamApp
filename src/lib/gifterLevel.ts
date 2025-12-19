export type GifterTierKey =
  | "grey"
  | "bronze"
  | "silver"
  | "gold"
  | "emerald"
  | "sapphire"
  | "ruby"
  | "amethyst"
  | "obsidian"
  | "diamond";

export type GifterTierDef = {
  key: GifterTierKey;
  name: string;
  index: number;
  entryUsd: number;
  color: string;
  letter: string;
};

export const GIFTER_TIERS: readonly GifterTierDef[] = [
  { key: "grey", name: "Starter", index: 1, entryUsd: 0, color: "#98A2B3", letter: "S" },
  { key: "bronze", name: "Supporter", index: 2, entryUsd: 1000, color: "#C67A3D", letter: "B" },
  { key: "silver", name: "Contributor", index: 3, entryUsd: 5000, color: "#B8C1D1", letter: "S" },
  { key: "gold", name: "Elite", index: 4, entryUsd: 15000, color: "#E0B84C", letter: "G" },
  { key: "emerald", name: "Patron", index: 5, entryUsd: 40000, color: "#2BB673", letter: "E" },
  { key: "sapphire", name: "Power", index: 6, entryUsd: 100000, color: "#2D6EEA", letter: "P" },
  { key: "ruby", name: "VIP", index: 7, entryUsd: 250000, color: "#E0445A", letter: "V" },
  { key: "amethyst", name: "Legend", index: 8, entryUsd: 500000, color: "#9B5DE5", letter: "L" },
  { key: "obsidian", name: "Mythic", index: 9, entryUsd: 750000, color: "#0B1220", letter: "M" },
  { key: "diamond", name: "Diamond (Elite)", index: 10, entryUsd: 1000000, color: "#4CC9F0", letter: "D" },
] as const;

export const DIAMOND_ENTRY_USD = 1_000_000;

export type GifterLevelInfo = {
  totalUsd: number;
  tierKey: GifterTierKey;
  tierName: string;
  tierIndex: number;
  tierLetter: string;
  displayLevel: number;
  isDiamond: boolean;
  ringColor: string;
  tierStartUsd: number;
  tierEndUsd: number;
  nextLevelUsd: number;
  nextTierUsd: number;
  progressPct: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function getGifterLevel(totalUsdRaw: number): GifterLevelInfo {
  const totalUsd = clamp(Number.isFinite(totalUsdRaw) ? totalUsdRaw : 0, 0, Number.MAX_SAFE_INTEGER);

  if (totalUsd >= DIAMOND_ENTRY_USD) {
    const L1 = 10;
    const E1 = 100_000;
    const L2 = 500;
    const E2 = 7_000_000;

    const x1 = Math.max(1, L1 - 1);
    const x2 = Math.max(2, L2 - 1);

    const p = Math.log(E2 / E1) / Math.log(x2 / x1);
    const a = E1 / Math.pow(x1, p);

    const excess = Math.max(0, totalUsd - DIAMOND_ENTRY_USD);
    const level = Math.max(1, Math.floor(Math.pow(excess / a, 1 / p)) + 1);

    const startExcess = a * Math.pow(level - 1, p);
    const nextExcess = a * Math.pow(level, p);
    const denom = Math.max(1, nextExcess - startExcess);

    const tier = GIFTER_TIERS[GIFTER_TIERS.length - 1];
    return {
      totalUsd,
      tierKey: tier.key,
      tierName: tier.name,
      tierIndex: tier.index,
      tierLetter: tier.letter,
      displayLevel: level,
      isDiamond: true,
      ringColor: tier.color,
      tierStartUsd: DIAMOND_ENTRY_USD,
      tierEndUsd: Infinity,
      nextLevelUsd: round2(Math.max(0, DIAMOND_ENTRY_USD + nextExcess - totalUsd)),
      nextTierUsd: 0,
      progressPct: round2(clamp(((excess - startExcess) / denom) * 100, 0, 100)),
    };
  }

  let tierIdx = 0;
  for (let i = 0; i < GIFTER_TIERS.length - 1; i += 1) {
    const start = GIFTER_TIERS[i].entryUsd;
    const next = GIFTER_TIERS[i + 1].entryUsd;
    if (totalUsd >= start && totalUsd < next) {
      tierIdx = i;
      break;
    }
  }

  const tier = GIFTER_TIERS[tierIdx];
  const tierStartUsd = tier.entryUsd;
  const tierEndUsd = GIFTER_TIERS[tierIdx + 1].entryUsd;

  const span = Math.max(1, tierEndUsd - tierStartUsd);
  const step = span / 50;

  const rawLevel = Math.floor((totalUsd - tierStartUsd) / step) + 1;
  const tierLevel = clamp(rawLevel, 1, 50);

  const nextLevelTarget = tierLevel >= 50 ? tierEndUsd : tierStartUsd + step * tierLevel;
  const nextTierTarget = tierEndUsd;

  return {
    totalUsd,
    tierKey: tier.key,
    tierName: tier.name,
    tierIndex: tier.index,
    tierLetter: tier.letter,
    displayLevel: tierLevel,
    isDiamond: false,
    ringColor: tier.color,
    tierStartUsd,
    tierEndUsd,
    nextLevelUsd: round2(Math.max(0, nextLevelTarget - totalUsd)),
    nextTierUsd: round2(Math.max(0, nextTierTarget - totalUsd)),
    progressPct: round2(clamp(((totalUsd - tierStartUsd) / span) * 100, 0, 100)),
  };
}
