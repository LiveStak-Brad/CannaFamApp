"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  MiniProfileModal,
  type MiniProfileAwardRow,
  type MiniProfilePointsRow,
  type MiniProfileSubject,
} from "@/components/ui/mini-profile";
import { GifterRingAvatar } from "@/components/ui/gifter-ring-avatar";

type PublicMember = {
  user_id: string;
  favorited_username: string;
  photo_url: string | null;
  bio: string | null;
  public_link?: string | null;
  instagram_link?: string | null;
  x_link?: string | null;
  tiktok_link?: string | null;
  youtube_link?: string | null;
  lifetime_gifted_total_usd?: number | null;
};

type AwardRow = {
  id: string;
  user_id: string;
  award_type: string | null;
  week_start: string | null;
  week_end: string | null;
  notes: string | null;
  created_at: string | null;
};

type LeaderboardRow = {
  user_id: string;
  favorited_username: string;
  total_points: number | null;
  streak_points: number | null;
  share_points: number | null;
  like_points: number | null;
  checkin_points: number | null;
  gift_bonus_points: number | null;
  spin_points: number | null;
};

export function MembersClient({
  members,
  awards,
  leaderboard,
  myUserId,
}: {
  members: PublicMember[];
  awards: AwardRow[];
  leaderboard: LeaderboardRow[];
  myUserId?: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(
    () => members.find((m) => m.user_id === selectedId) ?? null,
    [members, selectedId],
  );

  const subject: MiniProfileSubject | null = selected
    ? {
        user_id: selected.user_id,
        favorited_username: selected.favorited_username,
        photo_url: selected.photo_url,
        lifetime_gifted_total_usd:
          typeof selected.lifetime_gifted_total_usd === "number" ? selected.lifetime_gifted_total_usd : null,
        bio: selected.bio,
        public_link: selected.public_link ?? null,
        instagram_link: selected.instagram_link ?? null,
        x_link: selected.x_link ?? null,
        tiktok_link: selected.tiktok_link ?? null,
        youtube_link: selected.youtube_link ?? null,
      }
    : null;

  return (
    <>
      <div className="space-y-3">
        {members.length ? (
          members.map((m) => (
            <button
              key={m.user_id}
              type="button"
              className="block w-full text-left"
              onClick={() => setSelectedId(m.user_id)}
            >
              <Card>
                <div className="flex items-start gap-3">
                  <GifterRingAvatar
                    size={48}
                    imageUrl={m.photo_url}
                    name={m.favorited_username}
                    totalUsd={
                      typeof m.lifetime_gifted_total_usd === "number" ? m.lifetime_gifted_total_usd : null
                    }
                    showDiamondShimmer
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{m.favorited_username}</div>
                    {m.bio ? (
                      <div className="mt-1 text-sm text-[color:var(--muted)]">{m.bio}</div>
                    ) : null}
                  </div>
                </div>
              </Card>
            </button>
          ))
        ) : (
          <Card>
            <div className="text-sm text-[color:var(--muted)]">No approved members yet.</div>
          </Card>
        )}
      </div>

      <MiniProfileModal
        open={!!selectedId}
        subject={subject}
        awards={awards as unknown as MiniProfileAwardRow[]}
        leaderboard={leaderboard as unknown as MiniProfilePointsRow[]}
        myUserId={myUserId}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}
