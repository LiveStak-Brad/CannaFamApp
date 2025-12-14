"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import {
  MiniProfileModal,
  type MiniProfileAwardRow,
  type MiniProfilePointsRow,
  type MiniProfileSubject,
} from "@/components/ui/mini-profile";

type PublicMember = {
  id: string;
  favorited_username: string;
  photo_url: string | null;
  bio: string | null;
  public_link?: string | null;
  instagram_link?: string | null;
  x_link?: string | null;
  tiktok_link?: string | null;
  youtube_link?: string | null;
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
}: {
  members: PublicMember[];
  awards: AwardRow[];
  leaderboard: LeaderboardRow[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(
    () => members.find((m) => m.id === selectedId) ?? null,
    [members, selectedId],
  );

  const subject: MiniProfileSubject | null = selected
    ? {
        favorited_username: selected.favorited_username,
        photo_url: selected.photo_url,
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
              key={m.id}
              type="button"
              className="block w-full text-left"
              onClick={() => setSelectedId(m.id)}
            >
              <Card>
                <div className="flex items-start gap-4">
                  {m.photo_url ? (
                    <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-[color:var(--border)]">
                      <Image
                        src={m.photo_url}
                        alt={m.favorited_username}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="h-12 w-12 rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.03)]" />
                  )}
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
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}
