import Link from "next/link";
import Image from "next/image";
import { Container } from "@/components/shell/container";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getAuthedUserOrNull } from "@/lib/auth";

const VIP_TIERS = [
  { name: "Bronze", bg: "rgba(198,122,61,0.25)", border: "rgba(198,122,61,0.7)" },
  { name: "Silver", bg: "rgba(184,193,209,0.22)", border: "rgba(184,193,209,0.7)" },
  { name: "Gold", bg: "rgba(224,184,76,0.25)", border: "rgba(224,184,76,0.75)" },
  { name: "Diamond", bg: "rgba(45,212,191,0.22)", border: "rgba(76,201,240,0.7)" },
];

// Exact gifter ring tiers from @cannafam/shared GIFTER_TIERS
const GIFTER_RINGS = [
  { color: "#98A2B3", name: "Starter", letter: "S" },
  { color: "#C67A3D", name: "Supporter", letter: "B" },
  { color: "#B8C1D1", name: "Contributor", letter: "S" },
  { color: "#E0B84C", name: "Elite", letter: "G" },
  { color: "#2BB673", name: "Patron", letter: "E" },
  { color: "#2D6EEA", name: "Power", letter: "P" },
  { color: "#E0445A", name: "VIP", letter: "V" },
  { color: "#9B5DE5", name: "Legend", letter: "L" },
  { color: "#0B1220", name: "Mythic", letter: "M" },
  { color: "#4CC9F0", name: "Diamond", letter: "D" },
];

export const runtime = "nodejs";

export default async function Home() {
  const user = await getAuthedUserOrNull();

  return (
    <Container>
      <div className="space-y-2">
        {/* 1️⃣ Hero Section */}
        <div className="flex flex-col items-center gap-0.5 pt-1">
          <div className="relative h-14 w-14 overflow-hidden rounded-xl">
            <Image
              src="/applogo.png"
              alt="CannaFam"
              fill
              sizes="56px"
              className="object-cover scale-[1.08]"
              priority
            />
          </div>
          <h1 className="text-base font-semibold tracking-tight">Welcome to CannaFam</h1>
          <p className="text-[11px] font-medium text-[color:var(--foreground)] text-center leading-snug">
            A community-driven app where supporters back CannaStreams, earn recognition, and influence weekly outcomes — beyond algorithms.
          </p>
        </div>

        {/* 2️⃣ How It Works - 4-icon strip */}
        <Card title="How It Works">
          <div className="grid grid-cols-4 gap-1">
            <div className="flex flex-col items-center gap-0">
              <span className="text-base">🪙</span>
              <span className="text-[10px] font-bold text-[color:var(--foreground)]">Coins</span>
              <span className="text-[8px] text-[color:var(--muted)] text-center leading-tight">Send gifts</span>
            </div>
            <div className="flex flex-col items-center gap-0">
              <span className="text-base">🎁</span>
              <span className="text-[10px] font-bold text-[color:var(--foreground)]">Support</span>
              <span className="text-[8px] text-[color:var(--muted)] text-center leading-tight">Back the stream</span>
            </div>
            <div className="flex flex-col items-center gap-0">
              <span className="text-base">⭐</span>
              <span className="text-[10px] font-bold text-[color:var(--foreground)]">Points</span>
              <span className="text-[8px] text-[color:var(--muted)] text-center leading-tight">Daily Activities</span>
            </div>
            <div className="flex flex-col items-center gap-0">
              <span className="text-base">👑</span>
              <span className="text-[10px] font-bold text-[color:var(--foreground)]">VIP</span>
              <span className="text-[8px] text-[color:var(--muted)] text-center leading-tight">Monthly status</span>
            </div>
          </div>
        </Card>

        {/* 3️⃣ VIP Status (Monthly) - Centered pills */}
        <Card title="VIP Status (Monthly)">
          <div className="flex flex-wrap justify-center gap-4">
            {VIP_TIERS.map((tier) => (
              <div key={tier.name} className="flex flex-col items-center">
                <span
                  className="px-2.5 py-1 rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: tier.bg, border: `1px solid ${tier.border}` }}
                >
                  VIP
                </span>
                <span className="text-[10px] font-semibold text-[color:var(--foreground)] mt-1">{tier.name}</span>
              </div>
            ))}
          </div>
          <p className="text-[9px] text-[color:var(--muted)] italic text-center">Resets monthly based on coins purchased</p>
        </Card>

        {/* 4️⃣ Gifter Levels (Lifetime) - Centered rings */}
        <Card title="Gifter Levels (Lifetime)">
          <div className="grid grid-cols-5 gap-x-2 gap-y-2 w-full">
            {GIFTER_RINGS.map((g, idx) => (
              <div key={idx} className="flex flex-col items-center">
                <div
                  className="w-6 h-6 rounded-full border-2 bg-[color:var(--background)]"
                  style={{ borderColor: g.color }}
                />
                <span className="text-[9px] font-semibold text-[color:var(--foreground)] mt-1 text-center">{g.name}</span>
              </div>
            ))}
          </div>
          <p className="text-[9px] text-[color:var(--muted)] italic text-center">Based on lifetime coins gifted. Never resets.</p>
        </Card>

        {/* 5️⃣ Primary Actions - Auth only */}
        {!user ? (
          <div className="grid grid-cols-1 gap-2">
            <Button as="link" href="/signup" variant="primary">
              Create Account
            </Button>
            <Button as="link" href="/login" variant="secondary">
              Log In
            </Button>
          </div>
        ) : null}
      </div>
    </Container>
  );
}
