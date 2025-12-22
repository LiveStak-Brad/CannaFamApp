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
  sendMemberInvite,
  grantDailyGiftBonus,
  assignAward,
  addAdmin,
  removeAdmin,
} from "./actions";

type Application = {
  id: string;
  favorited_username?: string | null;
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

type AuditLogRow = {
  id: string;
  action_type: string;
  content_type: string;
  content_id: string | null;
  target_user_id: string | null;
  target_username: string;
  note: string | null;
  actor_id: string;
  actor_username: string;
  created_at: string;
};

type ReportRow = {
  id: string;
  reporter_user_id: string | null;
  reporter_username: string;
  report_type: string;
  target_type: string;
  target_id: string | null;
  target_user_id: string | null;
  target_username: string;
  reason: string;
  details: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_notes: string | null;
  created_at: string;
  content_preview: string | null;
};

type AdminTab = "awards" | "roles" | "members" | "moderation" | "audit";

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
  auditLog,
  reports,
}: {
  apps: Application[];
  members: Member[];
  posts: Post[];
  admins: AdminRow[];
  adminMembers: AdminMemberRow[];
  isOwner: boolean;
  auditLog: AuditLogRow[];
  reports: ReportRow[];
}) {
  const [activeTab, setActiveTab] = useState<AdminTab>("awards");
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

  const pendingReports = reports.filter((r) => r.status === "pending").length;

  const tabClass = (t: AdminTab) =>
    `px-3 py-2 text-xs font-semibold rounded-xl border transition ${activeTab === t
      ? "border-purple-500 bg-purple-600 text-white"
      : "border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] text-[color:var(--muted)] hover:bg-[rgba(255,255,255,0.05)]"
    }`;

  return (
    <div className="space-y-4">
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={tabClass("awards")} onClick={() => setActiveTab("awards")}>
          🏆 Awards
        </button>
        {isOwner && (
          <button type="button" className={tabClass("roles")} onClick={() => setActiveTab("roles")}>
            👑 Roles
          </button>
        )}
        <button type="button" className={tabClass("members")} onClick={() => setActiveTab("members")}>
          👥 Members
        </button>
        <button type="button" className={tabClass("moderation")} onClick={() => setActiveTab("moderation")}>
          🚨 Moderation
          {pendingReports > 0 && <span className="ml-1 inline-flex h-2 w-2 rounded-full bg-purple-400" />}
        </button>
        <button type="button" className={tabClass("audit")} onClick={() => setActiveTab("audit")}>
          📋 Audit Log
        </button>
      </div>

      {activeTab === "awards" && (
      <Card title="Assign award">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-xs font-semibold text-[color:var(--muted)] mb-1">Winner</div>
              <select
                value={awardMemberId}
                onChange={(e) => setAwardMemberId(e.target.value)}
                className="w-full rounded-lg bg-[color:var(--card)] px-3 py-2 text-sm text-[color:var(--foreground)] outline-none ring-1 ring-[color:var(--border)] focus:ring-[rgba(209,31,42,0.55)]"
              >
                {linkedMembersSorted.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.favorited_username}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-xs font-semibold text-[color:var(--muted)] mb-1">Category</div>
              <select
                value={awardType}
                onChange={(e) => setAwardType(e.target.value)}
                className="w-full rounded-lg bg-[color:var(--card)] px-3 py-2 text-sm text-[color:var(--foreground)] outline-none ring-1 ring-[color:var(--border)] focus:ring-[rgba(209,31,42,0.55)]"
              >
                {awardTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
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
            {pending ? "Saving..." : "Assign Award"}
          </Button>
        </div>
      </Card>
      )}

      {activeTab === "roles" && isOwner && (
        <Card title="Admin & Moderator Roles">
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-[color:var(--muted)]">Member</div>
              <select
                value={adminMemberId}
                onChange={(e) => setAdminMemberId(e.target.value)}
                className="w-full rounded-lg bg-[color:var(--card)] px-3 py-2 text-sm text-[color:var(--foreground)] outline-none ring-1 ring-[color:var(--border)] focus:ring-[rgba(209,31,42,0.55)]"
              >
                {membersSorted.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.favorited_username}
                    {m.user_id ? "" : " (unlinked)"}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                disabled={pending || !adminUserId}
                onClick={() => {
                  setMsg(null);
                  startTransition(async () => {
                    try {
                      const res = await addAdmin(adminUserId, "admin");
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
              <Button
                type="button"
                variant="secondary"
                disabled={pending || !adminUserId}
                onClick={() => {
                  setMsg(null);
                  startTransition(async () => {
                    try {
                      const res = await addAdmin(adminUserId, "moderator");
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
                Make Moderator
              </Button>
            </div>

            <div className="pt-2">
              <div className="text-xs font-semibold text-[color:var(--muted)]">Current roles</div>
              <div className="mt-2 space-y-1.5">
                {admins.length ? (
                  admins.map((a) => {
                    const name = adminNameByUserId.get(a.user_id) ?? a.user_id;
                    const role = String(a.role ?? "");
                    const badge = role === "owner" ? "👑" : role === "admin" ? "🛡️" : role === "moderator" ? "🚨" : "";
                    return (
                      <div
                        key={a.user_id}
                        className="flex items-center justify-between rounded-lg border border-[color:var(--border)] px-3 py-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span>{badge}</span>
                          <span className="text-sm font-semibold truncate">{name}</span>
                          <span className="text-xs text-[color:var(--muted)] capitalize">{role}</span>
                        </div>
                        {role === "owner" ? null : (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={pending}
                            onClick={() => {
                              const ok = window.confirm("Remove role for this user?");
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
                  <div className="text-sm text-[color:var(--muted)]">No roles assigned.</div>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {activeTab === "awards" && (
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
      )}

      {activeTab === "members" && (
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
                  <div className="flex items-center gap-2">
                    {!m.user_id ? (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => {
                          setMsg(null);
                          startTransition(async () => {
                            try {
                              const res = await sendMemberInvite(m.id);
                              setMsg({ tone: "success", text: res.message });
                            } catch (e) {
                              setMsg({
                                tone: "error",
                                text: e instanceof Error ? e.message : "Invite failed",
                              });
                            }
                          });
                        }}
                      >
                        Send invite
                      </Button>
                    ) : null}
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
                </div>
              ))
            ) : (
              <div className="text-sm text-[color:var(--muted)]">No members yet.</div>
            )}
          </div>
        </Card>
      )}

      {activeTab === "moderation" && (
        <Card title="Flagged Content">
          <div className="space-y-3">
            {reports.length === 0 ? (
              <div className="py-4 text-center text-sm text-[color:var(--muted)]">
                🎉 No reports to review!
              </div>
            ) : (
              reports.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] p-3"
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${
                      r.status === "pending" ? "bg-yellow-500/20 text-yellow-400" :
                      r.status === "actioned" ? "bg-green-500/20 text-green-400" :
                      "bg-gray-500/20 text-gray-400"
                    }`}>
                      {r.status}
                    </span>
                    <span className="text-[color:var(--muted)]">
                      {r.target_type === "post" ? "📝" : "💬"} {r.report_type}
                    </span>
                  </div>
                  <div className="mt-1 text-sm">
                    Reported by <span className="font-semibold">{r.reporter_username}</span>
                  </div>
                  {r.content_preview && (
                    <div className="mt-1 rounded bg-[rgba(0,0,0,0.2)] p-2 text-xs text-[color:var(--muted)]">
                      "{r.content_preview}"
                    </div>
                  )}
                  <div className="mt-1 text-xs text-[color:var(--muted)]">
                    {new Date(r.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))
            )}
            <div className="text-xs text-[color:var(--muted)]">
              For full moderation controls, visit the <a href="/moderator" className="underline">Moderator Dashboard</a>.
            </div>
          </div>
        </Card>
      )}

      {activeTab === "audit" && (
        <Card title="Audit Log">
          <div className="space-y-2">
            {auditLog.length === 0 ? (
              <div className="py-4 text-center text-sm text-[color:var(--muted)]">
                No moderation actions yet.
              </div>
            ) : (
              auditLog.map((a) => (
                <div
                  key={a.id}
                  className="rounded-lg border border-[color:var(--border)] px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{a.actor_username}</span>
                    <span className="text-[color:var(--muted)]">{a.action_type.replace(/_/g, " ")}</span>
                    {a.target_username && a.target_username !== "Unknown" && (
                      <span className="text-[color:var(--muted)]">→ {a.target_username}</span>
                    )}
                  </div>
                  {a.note && (
                    <div className="mt-1 text-[color:var(--muted)]">{a.note}</div>
                  )}
                  <div className="mt-1 text-[color:var(--muted)]">
                    {new Date(a.created_at).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

    </div>
  );
}
