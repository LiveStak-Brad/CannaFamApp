import Link from "next/link";
import Image from "next/image";
import { Container } from "@/components/shell/container";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getAuthedUserOrNull } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

export default async function Home() {
  const user = await getAuthedUserOrNull();
  const sb = await supabaseServer();

  const { data: member } = user
    ? await sb.from("cfm_members").select("id").eq("user_id", user.id).maybeSingle()
    : { data: null };

  return (
    <Container>
      <div className="space-y-5">
        <div className="mx-auto w-[200px]">
          <Image
            src="/applogo.png"
            alt="CannaFam"
            width={200}
            height={200}
            className="object-contain"
            priority
          />
        </div>

        {/* Welcome Header */}
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome to CannaFam</h1>
          <p className="text-sm text-[color:var(--muted)]">
            The official supporters community for CannaStreams
          </p>
        </div>

        {/* Primary Bio */}
        <Card>
          <div className="space-y-3 text-[15px] font-medium text-[color:var(--foreground)] leading-relaxed">
            <p>
              CannaFam is the official community built around CannaStreams — a creator-led live streaming brand focused on authenticity, consistency, and long-term connection.
            </p>
            <p>
              This app was created by an independent streamer, music artist, and father who built his audience from the ground up — without agencies, networks, or shortcuts. Everything here is powered by real people supporting real work, in real time.
            </p>
            <p>
              CannaFam exists so supporters always have a direct place to connect, participate, and be recognized — beyond algorithms or third-party platforms.
            </p>
          </div>
        </Card>

        {/* About the Creator */}
        <Card title="About the Creator">
          <div className="space-y-3 text-[15px] font-medium text-[color:var(--foreground)]">
            <div className="flex justify-center">
              <div className="relative w-[140px] h-[140px] overflow-hidden rounded-full">
                <Image
                  src="/marketing.png"
                  alt="Creator"
                  fill
                  sizes="140px"
                  className="object-cover"
                />
              </div>
            </div>
            <p className="leading-relaxed">
              CannaStreams is more than a channel — it's a long-term creative project. Behind it is:
            </p>
            <ul className="space-y-2">
              <li>• A full-time live streamer across multiple platforms</li>
              <li>• An independent music artist and performer</li>
              <li>• An app creator building community-owned tools</li>
              <li>• A father balancing creativity, business, and family</li>
            </ul>
            <p className="leading-relaxed">
              CannaFam brings all of that together in one place — where support actually matters and participation is rewarded.
            </p>
          </div>
        </Card>

        {/* Why CannaFam Exists */}
        <Card title="Why CannaFam Exists">
          <div className="space-y-3 text-[15px] font-medium text-[color:var(--foreground)]">
            <p className="leading-relaxed">
              Social platforms change. Algorithms shift. Monetization rules evolve.
            </p>
            <p className="leading-relaxed">
              CannaFam was built to give the community a stable home — where support goes directly toward:
            </p>
            <ul className="space-y-2">
              <li>• Live streaming production</li>
              <li>• Music releases and creative projects</li>
              <li>• App development and new features</li>
              <li>• Community rewards, VIP status, and weekly recognition</li>
            </ul>
            <p className="leading-relaxed">
              This is a supporters-first platform designed for sustainability, not short-term hype.
            </p>
          </div>
        </Card>

        {/* How It Works */}
        <Card title="How It Works">
          <div className="space-y-3 text-[15px] font-medium text-[color:var(--foreground)]">
            <ul className="space-y-2">
              <li>• Earn coins through in-app purchases or community rewards</li>
              <li>• Send coin gifts to support live streams and posts</li>
              <li>• Earn monthly VIP status based on your support</li>
              <li>• Compete on leaderboards and win weekly awards</li>
              <li>• Participate in daily activities to earn points</li>
            </ul>
            <p className="leading-relaxed">
              Everything is transparent, trackable, and designed to reward positive engagement.
            </p>
          </div>
        </Card>

        {/* What You Can Do */}
        <Card title="What You Can Do">
          <ul className="space-y-2 text-[15px] font-medium text-[color:var(--foreground)]">
            <li>• Join and support live streams</li>
            <li>• Track your progress and VIP status</li>
            <li>• Participate in daily activities</li>
            <li>• Earn recognition through leaderboards and awards</li>
            <li>• Be part of a creator-owned community</li>
          </ul>
        </Card>

        {/* Primary CTAs */}
        <div className="grid grid-cols-1 gap-3">
          {!user ? (
            <>
              <Button as="link" href="/signup" variant="primary">
                Create Account
              </Button>
              <Button as="link" href="/login" variant="secondary">
                Log In
              </Button>
            </>
          ) : null}
          <Button as="link" href="/members" variant="secondary">
            View Member Roster
          </Button>
          <Button as="link" href="/leaderboard" variant="secondary">
            View Leaderboards
          </Button>
        </div>

        {/* Footer Links */}
        <div className="text-xs text-[color:var(--muted)] text-center">
          <Link href="/members" className="underline underline-offset-4">
            Members
          </Link>
          <span className="px-2">|</span>
          <Link href="/leaderboard" className="underline underline-offset-4">
            Leaderboards
          </Link>
          <span className="px-2">|</span>
          <Link href="/daily-activities" className="underline underline-offset-4">
            Daily Activities
          </Link>
        </div>

        {/* Instagram Footer */}
        <div className="text-center">
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
