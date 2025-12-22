"use client";

import { useMemo, useState } from "react";
import {
  MiniProfileModal,
  type MiniProfileAwardRow,
  type MiniProfilePointsRow,
  type MiniProfileSubject,
} from "@/components/ui/mini-profile";
import { GifterRingAvatar } from "@/components/ui/gifter-ring-avatar";
import { VipBadge, type VipTier } from "@/components/ui/vip-badge";

export type PublicProfile = {
  favorited_username: string;
  photo_url: string | null;
  lifetime_gifted_total_usd?: number | null;
  vip_tier?: VipTier | null;
  bio: string | null;
  public_link?: string | null;
  instagram_link?: string | null;
  x_link?: string | null;
  tiktok_link?: string | null;
  youtube_link?: string | null;
};

export type AwardRow = {
  id: string;
  user_id: string;
  award_type: string | null;
  week_start: string | null;
  week_end: string | null;
  notes: string | null;
  created_at: string | null;
};

export type LeaderboardRow = {
  user_id: string;
  favorited_username: string;
  total_points: number | null;
  streak_points: number | null;
  share_points: number | null;
  like_points: number | null;
  comment_points?: number | null;
  comment_upvote_points?: number | null;
  checkin_points: number | null;
  gift_bonus_points: number | null;
  spin_points: number | null;
  link_visit_points?: number | null;
  gift_dollar_points?: number | null;
  follow_points?: number | null;
};

export type GiftLeaderboardRow = {
  user_id: string;
  favorited_username: string;
  total_cents: number;
  photo_url?: string | null;
  rank?: number;
};

function formatCoins(coins: number) {
  const n = Math.floor(Number(coins ?? 0));
  if (!Number.isFinite(n) || n <= 0) return "0 coins";
  return `${new Intl.NumberFormat("en-US").format(n)} coins`;
}

export function LeaderboardClient({
  rows,
  giftRowsToday,
  giftRowsWeekly,
  giftRowsAllTime,
  errorMessage,
  profiles,
  awards,
  myUserId,
}: {
  rows: LeaderboardRow[];
  giftRowsToday: GiftLeaderboardRow[];
  giftRowsWeekly: GiftLeaderboardRow[];
  giftRowsAllTime: GiftLeaderboardRow[];
  errorMessage?: string | null;
  profiles: PublicProfile[];
  awards: AwardRow[];
  myUserId?: string | null;
}) {
  const [mode, setMode] = useState<"points" | "gifts">("points");
  const [giftPeriod, setGiftPeriod] = useState<"today" | "weekly" | "all_time">("all_time");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const profileByUsername = useMemo(() => {
    const m = new Map<string, PublicProfile>();
    for (const p of profiles ?? []) {
      const uname = String(p?.favorited_username ?? "").trim();
      if (!uname) continue;
      m.set(uname, p);
    }
    return m;
  }, [profiles]);

  const giftRows = giftPeriod === "today" ? giftRowsToday : giftPeriod === "weekly" ? giftRowsWeekly : giftRowsAllTime;
  const selected = useMemo(() => {
    if (!selectedId) return null;
    if (mode === "gifts") {
      return giftRows.find((r) => r.user_id === selectedId) ?? null;
    }
    return rows.find((r) => r.user_id === selectedId) ?? null;
  }, [giftRows, mode, rows, selectedId]);

  const profile = useMemo(() => {
    if (!selected) return null;
    return profileByUsername.get(selected.favorited_username) ?? null;
  }, [profileByUsername, selected]);

  const subject: MiniProfileSubject | null = selected
    ? {
        user_id: selected.user_id,
        favorited_username: selected.favorited_username,
        photo_url: profile?.photo_url ?? null,
        lifetime_gifted_total_usd: profile?.lifetime_gifted_total_usd ?? null,
        vip_tier: (profile as any)?.vip_tier ?? null,
        bio: profile?.bio ?? null,
        public_link: profile?.public_link ?? null,
        instagram_link: profile?.instagram_link ?? null,
        x_link: profile?.x_link ?? null,
        tiktok_link: profile?.tiktok_link ?? null,
        youtube_link: profile?.youtube_link ?? null,
      }
    : null;

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          className={
            "rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-semibold transition " +
            (mode === "points"
              ? "bg-[color:var(--card)] text-[color:var(--foreground)]"
              : "bg-[rgba(255,255,255,0.02)] text-[color:var(--muted)] hover:bg-[rgba(255,255,255,0.05)]")
          }
          onClick={() => {
            setMode("points");
            setSelectedId(null);
          }}
        >
          Points
        </button>
        <button
          type="button"
          className={
            "rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-semibold transition " +
            (mode === "gifts"
              ? "bg-[color:var(--card)] text-[color:var(--foreground)]"
              : "bg-[rgba(255,255,255,0.02)] text-[color:var(--muted)] hover:bg-[rgba(255,255,255,0.05)]")
          }
          onClick={() => {
            setMode("gifts");
            setSelectedId(null);
          }}
        >
          Gifts
        </button>
      </div>

      {errorMessage ? (
        <div className="space-y-2 text-sm text-[color:var(--muted)]">
          <div>Leaderboard is available to approved members.</div>
          <div className="text-xs">{errorMessage}</div>
        </div>
      ) : mode === "gifts" ? (
        <>
          <div className="mb-3 flex gap-2">
            <button
              type="button"
              className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                giftPeriod === "today" ? "border-red-500 bg-red-600 text-white" : "border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] text-[color:var(--muted)] hover:bg-[rgba(255,255,255,0.05)]"
              }`}
              onClick={() => setGiftPeriod("today")}
            >
              Today
            </button>
            <button
              type="button"
              className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                giftPeriod === "weekly" ? "border-red-500 bg-red-600 text-white" : "border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] text-[color:var(--muted)] hover:bg-[rgba(255,255,255,0.05)]"
              }`}
              onClick={() => setGiftPeriod("weekly")}
            >
              Weekly
            </button>
            <button
              type="button"
              className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                giftPeriod === "all_time" ? "border-red-500 bg-red-600 text-white" : "border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] text-[color:var(--muted)] hover:bg-[rgba(255,255,255,0.05)]"
              }`}
              onClick={() => setGiftPeriod("all_time")}
            >
              All-Time
            </button>
          </div>
          {giftRows.length ? (
            <div className="space-y-2">
              {giftRows.map((m, idx) => {
                const rank = m.rank ?? idx + 1;
                const medalEmoji = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
                const bgClass = rank === 1 ? "bg-yellow-500/10 border-yellow-500/30" : rank === 2 ? "bg-gray-400/10 border-gray-400/30" : rank === 3 ? "bg-orange-500/10 border-orange-500/30" : "border-[color:var(--border)]";
                const rowProfile = profileByUsername.get(m.favorited_username) ?? null;
                return (
                  <button
                    key={m.user_id}
                    type="button"
                    onClick={() => setSelectedId(m.user_id)}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition hover:bg-[rgba(255,255,255,0.05)] ${bgClass}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 shrink-0 text-center">
                        {medalEmoji ? (
                          <span className="text-xl">{medalEmoji}</span>
                        ) : (
                          <span className="text-sm font-semibold text-[color:var(--muted)]">#{rank}</span>
                        )}
                      </div>
                      <div className="shrink-0">
                        <GifterRingAvatar
                          size={28}
                          imageUrl={m.photo_url ?? rowProfile?.photo_url ?? null}
                          name={m.favorited_username}
                          totalUsd={
                            typeof rowProfile?.lifetime_gifted_total_usd === "number"
                              ? rowProfile.lifetime_gifted_total_usd
                              : null
                          }
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="inline-flex items-center gap-2 font-semibold">
                          <span className="truncate">{m.favorited_username}</span>
                          <VipBadge tier={(rowProfile as any)?.vip_tier ?? null} />
                        </span>
                      </div>
                      <div className="font-bold text-green-500">{formatCoins(m.total_cents)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-6 text-center">
              <div className="text-3xl mb-2">💸</div>
              <div className="text-sm text-[color:var(--muted)]">No gifts yet for this period.</div>
            </div>
          )}
        </>
      ) : rows.length ? (
        <div className="space-y-2">
          {rows.map((m, idx) => {
            const rank = idx + 1;
            const medalEmoji = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
            const bgClass = rank === 1 ? "bg-yellow-500/10 border-yellow-500/30" : rank === 2 ? "bg-gray-400/10 border-gray-400/30" : rank === 3 ? "bg-orange-500/10 border-orange-500/30" : "border-[color:var(--border)]";
            const rowProfile = profileByUsername.get(m.favorited_username) ?? null;
            return (
              <button
                key={m.user_id}
                type="button"
                onClick={() => setSelectedId(m.user_id)}
                className={`w-full rounded-xl border px-3 py-3 text-left transition hover:bg-[rgba(255,255,255,0.05)] ${bgClass}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 shrink-0 text-center">
                    {medalEmoji ? (
                      <span className="text-xl">{medalEmoji}</span>
                    ) : (
                      <span className="text-sm font-semibold text-[color:var(--muted)]">#{rank}</span>
                    )}
                  </div>
                  <div className="shrink-0">
                    <GifterRingAvatar
                      size={28}
                      imageUrl={rowProfile?.photo_url ?? null}
                      name={m.favorited_username}
                      totalUsd={
                        typeof rowProfile?.lifetime_gifted_total_usd === "number"
                          ? rowProfile.lifetime_gifted_total_usd
                          : null
                      }
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-2 font-semibold">
                        <span className="truncate">{m.favorited_username}</span>
                        <VipBadge tier={(rowProfile as any)?.vip_tier ?? null} />
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-[color:var(--muted)]">
                      <span>🔥 {m.streak_points ?? 0}</span>
                      <span>🔗 {m.share_points ?? 0}</span>
                      <span>❤️ {m.like_points ?? 0}</span>
                      {typeof m.comment_points !== "undefined" ? (
                        <span>💬 {m.comment_points ?? 0}</span>
                      ) : null}
                      {typeof m.comment_upvote_points !== "undefined" ? (
                        <span>⬆️ {m.comment_upvote_points ?? 0}</span>
                      ) : null}
                      <span>✅ {m.checkin_points ?? 0}</span>
                      <span>🎁 {m.gift_bonus_points ?? 0}</span>
                      <span>🎡 {m.spin_points ?? 0}</span>
                      {typeof m.link_visit_points !== "undefined" ? (
                        <span>🔎 {m.link_visit_points ?? 0}</span>
                      ) : null}
                      {typeof m.gift_dollar_points !== "undefined" ? (
                        <span>💰 {formatCoins(m.gift_dollar_points ?? 0)}</span>
                      ) : null}
                      {typeof m.follow_points !== "undefined" ? (
                        <span>👥 {m.follow_points ?? 0}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="font-bold text-lg">{m.total_points ?? 0}</div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="text-sm text-[color:var(--muted)]">No leaderboard entries yet.</div>
      )}

      <MiniProfileModal
        open={!!selectedId}
        subject={subject}
        leaderboard={rows as unknown as MiniProfilePointsRow[]}
        awards={awards as unknown as MiniProfileAwardRow[]}
        myUserId={myUserId}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}

export function CurrentWinners({
  rows,
  profiles,
  awards,
}: {
  rows: LeaderboardRow[];
  profiles: PublicProfile[];
  awards: AwardRow[];
}) {
  const categories = [
    "🏆 MVP",
    "🌱 Rookie",
    "🎯 Top Sniper",
    "💎 Top Supporter",
    "📣 Most Shares",
    "🔥 Most Consistent",
  ];

  const latestByType = useMemo(() => {
    const m = new Map<string, AwardRow>();
    for (const a of awards) {
      const t = String(a.award_type ?? "").trim();
      if (!t) continue;
      const prev = m.get(t);
      if (!prev) {
        m.set(t, a);
        continue;
      }
      const aTime = a.created_at ?? "";
      const pTime = prev.created_at ?? "";
      if (aTime > pTime) m.set(t, a);
    }
    return m;
  }, [awards]);

  return (
    <div className="space-y-2">
      {categories.map((cat) => {
        const win = latestByType.get(cat) ?? null;
        const member = win ? rows.find((r) => r.user_id === win.user_id) ?? null : null;
        const profile = member
          ? profiles.find((p) => p.favorited_username === member.favorited_username) ?? null
          : null;

        return (
          <div
            key={cat}
            className="flex items-center justify-between rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-3"
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold">{cat}</div>
              {member ? (
                <div className="mt-1 flex items-center gap-2 text-sm">
                  <GifterRingAvatar
                    size={26}
                    imageUrl={profile?.photo_url ?? null}
                    name={member.favorited_username}
                    totalUsd={
                      typeof profile?.lifetime_gifted_total_usd === "number" ? profile.lifetime_gifted_total_usd : null
                    }
                  />
                  <div className="truncate text-[color:var(--muted)]">
                    {member.favorited_username}
                  </div>
                </div>
              ) : (
                <div className="mt-1 text-sm text-[color:var(--muted)]">
                  Your photo here — start competing now.
                </div>
              )}
            </div>

            {member ? (
              <div className="text-sm font-semibold">{member.total_points ?? 0}</div>
            ) : (
              <div className="text-sm text-[color:var(--muted)]">—</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
