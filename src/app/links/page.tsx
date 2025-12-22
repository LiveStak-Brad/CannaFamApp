import Link from "next/link";
import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { getAuthedUserOrNull } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { todayISODate } from "@/lib/utils";
import { LinksClient } from "./ui";

export const runtime = "nodejs";

const LINKS = [
  {
    type: "instagram",
    icon: "📸",
    label: "Instagram",
    description: "@cannafamapp",
    url: "https://instagram.com/cannafamapp",
  },
  {
    type: "facebook",
    icon: "📘",
    label: "Facebook",
    description: "CannaStreams STL",
    url: "https://facebook.com/cannastreamsstl",
  },
  {
    type: "tiktok",
    icon: "🎵",
    label: "TikTok",
    description: "@cannastreams",
    url: "https://tiktok.com/@cannastreams",
  },
  {
    type: "youtube",
    icon: "▶️",
    label: "YouTube",
    description: "Brad Morris",
    url: "https://www.youtube.com/bradmorris",
  },
  {
    type: "x",
    icon: "𝕏",
    label: "X (Twitter)",
    description: "@cannastreams_x",
    url: "https://x.com/cannastreams_x",
  },
  {
    type: "snapchat",
    icon: "👻",
    label: "Snapchat",
    description: "CannaStreams",
    url: "https://snapchat.com/t/fubxYw5n",
  },
];

export default async function LinksPage() {
  const user = await getAuthedUserOrNull();
  const sb = await supabaseServer();

  const { data: member } = user
    ? await sb.from("cfm_members").select("id").eq("user_id", user.id).maybeSingle()
    : { data: null };
  const canEarn = !!user && !!member;

  let visitedToday: string[] = [];
  if (canEarn) {
    const today = todayISODate();
    try {
      const { data: visits } = await sb
        .from("cfm_link_visits")
        .select("link_type")
        .eq("user_id", user!.id)
        .eq("visit_date", today);
      visitedToday = (visits ?? []).map((v: any) => String(v.link_type));
    } catch {
      visitedToday = [];
    }
  }

  return (
    <Container>
      <div className="space-y-5">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">CannaStreams Links</h1>
          <p className="text-sm text-[color:var(--muted)]">
            Official social media and community links
          </p>
        </div>

        {canEarn ? (
          <Card title="🔎 Earn Points">
            <div className="space-y-2 text-sm">
              <p className="text-[color:var(--foreground)]">
                Visit links to earn +1 point each (max 6/day)
              </p>
              <p className="font-semibold text-[color:var(--foreground)]">
                {visitedToday.length}/6 visited today
              </p>
            </div>
          </Card>
        ) : null}

        <LinksClient links={LINKS} initialVisited={visitedToday} canEarn={canEarn} />

        <div className="pt-4 text-center">
          <a
            href="https://instagram.com/cannafamapp"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[color:var(--muted)] underline underline-offset-4"
          >
            📸 Instagram: @cannafamapp
          </a>
        </div>
      </div>
    </Container>
  );
}
