"use client";

import { useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export type MiniProfileSubject = {
  user_id?: string | null;
  favorited_username: string;
  photo_url?: string | null;
  bio?: string | null;
  public_link?: string | null;
};

export type MiniProfilePointsRow = {
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
};

export type MiniProfileAwardRow = {
  id: string;
  user_id: string;
  award_type: string | null;
  week_start: string | null;
  week_end: string | null;
  notes: string | null;
  created_at: string | null;
};

export function MiniProfileModal({
  open,
  subject,
  leaderboard,
  awards,
  onClose,
}: {
  open: boolean;
  subject: MiniProfileSubject | null;
  leaderboard: MiniProfilePointsRow[];
  awards: MiniProfileAwardRow[];
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !subject) return null;

  const lb = useMemo(() => {
    if (subject.user_id) {
      return leaderboard.find((r) => r.user_id === subject.user_id) ?? null;
    }
    return leaderboard.find((r) => r.favorited_username === subject.favorited_username) ?? null;
  }, [leaderboard, subject.favorited_username, subject.user_id]);

  const awardCounts = useMemo(() => {
    const uid = lb?.user_id ?? subject.user_id;
    if (!uid) return new Map<string, number>();
    const out = new Map<string, number>();
    for (const a of awards) {
      if (a.user_id !== uid) continue;
      const t = String(a.award_type ?? "").trim();
      if (!t) continue;
      out.set(t, (out.get(t) ?? 0) + 1);
    }
    return out;
  }, [awards, lb?.user_id, subject.user_id]);

  const initial = (subject.favorited_username || "?").trim().slice(0, 1).toUpperCase();
  const photoUrl = subject.photo_url ?? null;
  const bio = subject.bio ?? null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close member profile"
        onClick={onClose}
      />

      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-xl px-4 pb-4">
        <Card title="Member">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt={subject.favorited_username}
                  className="h-12 w-12 rounded-full border border-[color:var(--border)] object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[color:var(--border)] bg-[rgba(255,255,255,0.05)] text-lg font-semibold">
                  {initial}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-base font-semibold truncate">{subject.favorited_username}</div>
                <div className="text-xs text-[color:var(--muted)]">Mini profile</div>
              </div>
            </div>

            {bio ? (
              <div className="text-sm text-[color:var(--muted)] whitespace-pre-wrap">{bio}</div>
            ) : (
              <div className="text-sm text-[color:var(--muted)]">No bio yet.</div>
            )}

            {lb ? (
              <div className="rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                <div className="text-xs text-[color:var(--muted)]">Total points</div>
                <div className="mt-1 text-3xl font-semibold">{lb.total_points ?? 0}</div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-[color:var(--muted)]">
                  <span>🔥 {lb.streak_points ?? 0}</span>
                  <span>🔗 {lb.share_points ?? 0}</span>
                  <span>❤️ {lb.like_points ?? 0}</span>
                  {typeof lb.comment_points !== "undefined" ? (
                    <span>💬 {lb.comment_points ?? 0}</span>
                  ) : null}
                  {typeof lb.comment_upvote_points !== "undefined" ? (
                    <span>⬆️ {lb.comment_upvote_points ?? 0}</span>
                  ) : null}
                  <span>✅ {lb.checkin_points ?? 0}</span>
                  <span>🎁 {lb.gift_bonus_points ?? 0}</span>
                  <span>🎡 {lb.spin_points ?? 0}</span>
                  {typeof lb.link_visit_points !== "undefined" ? (
                    <span>🔎 {lb.link_visit_points ?? 0}</span>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                <div className="text-sm text-[color:var(--muted)]">
                  Points breakdown is available to members.
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="text-xs font-semibold text-[color:var(--muted)]">Awards</div>
              {awardCounts.size ? (
                <div className="flex flex-wrap gap-2 text-sm">
                  {Array.from(awardCounts.entries())
                    .sort((a, b) => b[1] - a[1])
                    .map(([t, n]) => (
                      <span
                        key={t}
                        className="rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-xs"
                      >
                        {t} x{n}
                      </span>
                    ))}
                </div>
              ) : (
                <div className="text-sm text-[color:var(--muted)]">No awards yet.</div>
              )}
            </div>

            {subject.public_link ? (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[color:var(--muted)]">Link</div>
                <a
                  href={subject.public_link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm underline underline-offset-4"
                >
                  {subject.public_link}
                </a>
              </div>
            ) : null}

            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
