"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Notice } from "@/components/ui/notice";
import {
  approveApplication,
  rejectApplication,
  removeMember,
  createFeedPost,
  grantDailyGiftBonus,
  assignAward,
  addAdmin,
  removeAdmin,
} from "./actions";

type Application = {
  id: string;
  favorited_username: string;
  email: string | null;
  photo_url: string | null;
  bio: string | null;
  wants_banner: boolean | null;
  status: string | null;
  created_at: string | null;
};

type Member = {
  id: string;
  user_id: string | null;
  favorited_username: string;
  photo_url: string | null;
  bio: string | null;
  points: number | null;
  created_at: string | null;
};

type Post = {
  id: string;
  title: string | null;
  post_type: string | null;
  created_at: string | null;
};

type AdminRow = {
  user_id: string;
  role: string | null;
  created_at: string | null;
};

type AdminMemberRow = {
  user_id: string;
  favorited_username: string;
};

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function currentWeekRangeISO() {
  // Use Monday-start week.
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = (day + 6) % 7;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - diffToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: isoDate(start), end: isoDate(end) };
}

export function AdminActions({
  apps,
  members,
  posts,
  admins,
  adminMembers,
  isOwner,
}: {
  apps: Application[];
  members: Member[];
  posts: Post[];
  admins: AdminRow[];
  adminMembers: AdminMemberRow[];
  isOwner: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(
    null,
  );

  const membersSorted = useMemo(
    () => [...members].sort((a, b) => a.favorited_username.localeCompare(b.favorited_username)),
    [members],
  );

  const [giftMemberId, setGiftMemberId] = useState<string>(membersSorted[0]?.id ?? "");
  const selectedGiftMember = useMemo(
    () => members.find((m) => m.id === giftMemberId) ?? null,
    [members, giftMemberId],
  );
  const giftUserId = selectedGiftMember?.user_id ?? "";

  const pendingApps = useMemo(
    () => apps.filter((a) => a.status === "pending"),
    [apps],
  );

  const adminNameByUserId = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of adminMembers) {
      if (!r.user_id) continue;
      m.set(r.user_id, r.favorited_username);
    }
    return m;
  }, [adminMembers]);

  const [adminMemberId, setAdminMemberId] = useState<string>(membersSorted[0]?.id ?? "");
  const selectedAdminMember = useMemo(
    () => members.find((m) => m.id === adminMemberId) ?? null,
    [members, adminMemberId],
  );
  const adminUserId = selectedAdminMember?.user_id ?? "";

  const linkedMembersSorted = useMemo(
    () => membersSorted.filter((m) => !!m.user_id),
    [membersSorted],
  );

  const [awardMemberId, setAwardMemberId] = useState<string>(linkedMembersSorted[0]?.id ?? "");
  const selectedAwardMember = useMemo(
    () => members.find((m) => m.id === awardMemberId) ?? null,
    [members, awardMemberId],
  );
  const awardUserId = selectedAwardMember?.user_id ?? "";

  const awardTypes = useMemo(
    () => [
      "🏆 MVP",
      "🌱 Rookie",
      "🎯 Top Sniper",
      "💎 Top Supporter",
      "📣 Most Shares",
      "🔥 Most Consistent",
    ],
    [],
  );

  const [awardType, setAwardType] = useState<string>(awardTypes[0] ?? "🏆 MVP");
  const weekDefaults = useMemo(() => currentWeekRangeISO(), []);
  const [weekStart, setWeekStart] = useState<string>(weekDefaults.start);
  const [weekEnd, setWeekEnd] = useState<string>(weekDefaults.end);
  const [awardNotes, setAwardNotes] = useState<string>("");

  return (
    <div className="space-y-4">
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      {isOwner ? (
        <Card title="Admin roles">
          <div className="space-y-3">
            <div className="text-sm text-[color:var(--muted)]">
              Promote or remove admins. Only the owner can change roles.
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-[color:var(--muted)]">Member</div>
              <select
                value={adminMemberId}
                onChange={(e) => setAdminMemberId(e.target.value)}
                className="w-full rounded-xl bg-[color:var(--card)] px-4 py-3 text-sm text-[color:var(--foreground)] outline-none ring-1 ring-[color:var(--border)] focus:ring-[rgba(209,31,42,0.55)]"
              >
                {membersSorted.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.favorited_username}
                    {m.user_id ? "" : " (unlinked)"}
                  </option>
                ))}
              </select>
              {!adminUserId ? (
                <div className="text-xs text-[color:var(--muted)]">
                  This member is not linked yet (no user_id). Link them before promoting.
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                disabled={pending || !adminUserId}
                onClick={() => {
                  setMsg(null);
                  startTransition(async () => {
                    try {
                      const res = await addAdmin(adminUserId);
                      setMsg({ tone: "success", text: res.message });
                    } catch (e) {
                      setMsg({
                        tone: "error",
                        text: e instanceof Error ? e.message : "Promote failed",
                      });
                    }
                  });
                }}
              >
                Make Admin
              </Button>
            </div>

            <div className="pt-2">
              <div className="text-xs font-semibold text-[color:var(--muted)]">Current admins</div>
              <div className="mt-2 space-y-2">
                {admins.length ? (
                  admins.map((a) => {
                    const name = adminNameByUserId.get(a.user_id) ?? a.user_id;
                    const role = String(a.role ?? "");
                    return (
                      <div
                        key={a.user_id}
                        className="flex items-center justify-between rounded-xl border border-[color:var(--border)] px-4 py-3"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">{name}</div>
                          <div className="mt-1 text-xs text-[color:var(--muted)]">{role}</div>
                        </div>
                        {role === "owner" ? (
                          <div className="text-xs text-[color:var(--muted)]">Owner</div>
                        ) : (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={pending}
                            onClick={() => {
                              const ok = window.confirm("Remove admin access for this user?");
                              if (!ok) return;
                              setMsg(null);
                              startTransition(async () => {
                                try {
                                  const res = await removeAdmin(a.user_id);
                                  setMsg({ tone: "success", text: res.message });
                                } catch (e) {
                                  setMsg({
                                    tone: "error",
                                    text: e instanceof Error ? e.message : "Remove failed",
                                  });
                                }
                              });
                            }}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-sm text-[color:var(--muted)]">No admins found.</div>
                )}
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      <Card title="Daily gift bonus (🎁 +5)">
        <div className="space-y-3">
          <div className="text-sm text-[color:var(--muted)]">
            Admin-confirmed 1k+ coins gift bonus. Once per user per day.
          </div>
          <div className="space-y-2">
            <div className="text-xs font-semibold text-[color:var(--muted)]">Member</div>
            <select
              value={giftMemberId}
              onChange={(e) => setGiftMemberId(e.target.value)}
              className="w-full rounded-xl bg-[color:var(--card)] px-4 py-3 text-sm text-[color:var(--foreground)] outline-none ring-1 ring-[color:var(--border)] focus:ring-[rgba(209,31,42,0.55)]"
            >
              {membersSorted.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.favorited_username}
                  {m.user_id ? "" : " (unlinked)"}
                </option>
              ))}
            </select>
            {!giftUserId ? (
              <div className="text-xs text-[color:var(--muted)]">
                This member is not linked yet (no user_id). Link them before granting.
              </div>
            ) : null}
          </div>
          <Button
            type="button"
            disabled={pending || !giftUserId}
            onClick={() => {
              setMsg(null);
              startTransition(async () => {
                try {
                  const res = await grantDailyGiftBonus(giftUserId);
                  setMsg({ tone: "success", text: res.message });
                } catch (e) {
                  setMsg({
                    tone: "error",
                    text: e instanceof Error ? e.message : "Gift bonus failed",
                  });
                }
              });
            }}
          >
            Grant +5
          </Button>
        </div>
      </Card>

      <Card title={`Applications (${pendingApps.length} pending)`}>
        <div className="space-y-3">
          {pendingApps.length ? (
            pendingApps.map((a) => (
              <div
                key={a.id}
                className="rounded-xl border border-[color:var(--border)] p-4"
              >
                <div className="text-sm font-semibold">{a.favorited_username}</div>
                <div className="mt-1 text-xs text-[color:var(--muted)]">
                  {a.email ?? "No email"}
                  {a.wants_banner ? " • wants banner" : ""}
                </div>
                {a.bio ? (
                  <div className="mt-2 text-sm text-[color:var(--muted)] whitespace-pre-wrap">
                    {a.bio}
                  </div>
                ) : null}
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setMsg(null);
                      startTransition(async () => {
                        try {
                          await approveApplication(a.id);
                          setMsg({ tone: "success", text: `Approved: ${a.favorited_username}` });
                        } catch (e) {
                          setMsg({
                            tone: "error",
                            text: e instanceof Error ? e.message : "Approve failed",
                          });
                        }
                      });
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => {
                      setMsg(null);
                      startTransition(async () => {
                        try {
                          await rejectApplication(a.id);
                          setMsg({ tone: "success", text: `Rejected: ${a.favorited_username}` });
                        } catch (e) {
                          setMsg({
                            tone: "error",
                            text: e instanceof Error ? e.message : "Reject failed",
                          });
                        }
                      });
                    }}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-[color:var(--muted)]">No pending applications.</div>
          )}
        </div>
      </Card>

      <Card title="Members">
        <div className="space-y-2">
          {members.length ? (
            members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-xl border border-[color:var(--border)] p-4"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{m.favorited_username}</div>
                  <div className="mt-1 text-xs text-[color:var(--muted)]">
                    points: {m.points ?? 0}
                    {m.user_id ? " • linked" : " • unlinked"}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    setMsg(null);
                    startTransition(async () => {
                      try {
                        await removeMember(m.id);
                        setMsg({ tone: "success", text: `Removed: ${m.favorited_username}` });
                      } catch (e) {
                        setMsg({
                          tone: "error",
                          text: e instanceof Error ? e.message : "Remove failed",
                        });
                      }
                    });
                  }}
                >
                  Remove
                </Button>
              </div>
            ))
          ) : (
            <div className="text-sm text-[color:var(--muted)]">No members yet.</div>
          )}
        </div>
      </Card>

      <Card title="Create feed post">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setMsg(null);
            const fd = new FormData(e.currentTarget);
            startTransition(async () => {
              try {
                await createFeedPost(fd);
                setMsg({ tone: "success", text: "Feed post created." });
                e.currentTarget.reset();
              } catch (err) {
                setMsg({
                  tone: "error",
                  text: err instanceof Error ? err.message : "Create failed",
                });
              }
            });
          }}
        >
          <Input label="Title" name="title" required placeholder="Post title" />
          <Input
            label="Post type"
            name="post_type"
            required
            placeholder="gift | snipe | award | leaderboard | announcement"
          />
          <Textarea label="Content" name="content" required placeholder="Write the update" />
          <div className="space-y-1">
            <div className="text-sm font-medium">Media (optional)</div>
            <input
              type="file"
              name="media"
              accept="image/*,video/*"
              className="block w-full text-sm text-[color:var(--muted)] file:mr-3 file:rounded-lg file:border file:border-[color:var(--border)] file:bg-black/20 file:px-3 file:py-2 file:text-sm file:text-[color:var(--foreground)]"
            />
            <div className="text-xs text-[color:var(--muted)]">
              One image or video. Uploading media is admin-only.
            </div>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : "Create post"}
          </Button>
        </form>

        {posts.length ? (
          <div className="mt-4 space-y-2">
            <div className="text-xs text-[color:var(--muted)]">Recent posts</div>
            {posts.map((p) => (
              <div key={p.id} className="text-sm text-[color:var(--muted)]">
                {p.title} {p.post_type ? `(${p.post_type})` : ""}
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      <Card title="Assign award">
        <div className="space-y-4">
          <div className="text-sm text-[color:var(--muted)]">
            Pick a linked member and a category. Week defaults to the current Monday–Sunday.
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-[color:var(--muted)]">Winner</div>
            <select
              value={awardMemberId}
              onChange={(e) => setAwardMemberId(e.target.value)}
              className="w-full rounded-xl bg-[color:var(--card)] px-4 py-3 text-sm text-[color:var(--foreground)] outline-none ring-1 ring-[color:var(--border)] focus:ring-[rgba(209,31,42,0.55)]"
            >
              {linkedMembersSorted.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.favorited_username}
                </option>
              ))}
            </select>
            {!awardUserId ? (
              <div className="text-xs text-[color:var(--muted)]">No linked members found.</div>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-[color:var(--muted)]">Category</div>
            <select
              value={awardType}
              onChange={(e) => setAwardType(e.target.value)}
              className="w-full rounded-xl bg-[color:var(--card)] px-4 py-3 text-sm text-[color:var(--foreground)] outline-none ring-1 ring-[color:var(--border)] focus:ring-[rgba(209,31,42,0.55)]"
            >
              {awardTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Week start"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              placeholder="YYYY-MM-DD"
            />
            <Input
              label="Week end"
              value={weekEnd}
              onChange={(e) => setWeekEnd(e.target.value)}
              placeholder="YYYY-MM-DD"
            />
          </div>

          <Textarea
            label="Notes (optional)"
            value={awardNotes}
            onChange={(e) => setAwardNotes(e.target.value)}
            placeholder="Optional notes"
          />

          <Button
            type="button"
            disabled={pending || !awardUserId || !awardType || !weekStart || !weekEnd}
            onClick={() => {
              setMsg(null);
              startTransition(async () => {
                try {
                  const fd = new FormData();
                  fd.set("user_id", awardUserId);
                  fd.set("award_type", awardType);
                  fd.set("week_start", weekStart);
                  fd.set("week_end", weekEnd);
                  fd.set("notes", awardNotes);
                  const res = await assignAward(fd);
                  setMsg({ tone: "success", text: res.message });
                } catch (err) {
                  setMsg({
                    tone: "error",
                    text: err instanceof Error ? err.message : "Assign failed",
                  });
                }
              });
            }}
          >
            {pending ? "Saving..." : "Assign award"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
