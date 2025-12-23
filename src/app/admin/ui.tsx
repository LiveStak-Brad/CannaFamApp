"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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
  computeWeeklyAwards,
  getCurrentWeekStartEt,
  previewWeeklyAwardsMetrics,
  upsertWeeklyAwardsInput,
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

  const weekDefaults = useMemo(() => currentWeekRangeISO(), []);
  const [weekStart, setWeekStart] = useState<string>(weekDefaults.start);
  const [awardMemberId, setAwardMemberId] = useState<string>(linkedMembersSorted[0]?.id ?? "");
  const selectedAwardMember = useMemo(
    () => members.find((m) => m.id === awardMemberId) ?? null,
    [members, awardMemberId],
  );
  const awardUserId = selectedAwardMember?.user_id ?? "";

  const [showedUp, setShowedUp] = useState(false);
  const [helpedOthers, setHelpedOthers] = useState(false);
  const [goodVibes, setGoodVibes] = useState(false);
  const [problematic, setProblematic] = useState(false);
  const [externalGiftsCoins, setExternalGiftsCoins] = useState<string>("0");
  const [externalSnipesCoins, setExternalSnipesCoins] = useState<string>("0");
  const [notes, setNotes] = useState<string>("");

  const [metricsRows, setMetricsRows] = useState<any[] | null>(null);
  const [computedRows, setComputedRows] = useState<any[] | null>(null);

  useEffect(() => {
    if (linkedMembersSorted.length && !awardMemberId) {
      setAwardMemberId(linkedMembersSorted[0]?.id ?? "");
    }
  }, [awardMemberId, linkedMembersSorted]);

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
        <button type="button" className={tabClass("roles")} onClick={() => setActiveTab("roles")}>
          👑 Roles
        </button>
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
        <Card title="Weekly Awards Builder">
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Input
                label="Week start (ET)"
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
                placeholder="YYYY-MM-DD"
              />
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    setMsg(null);
                    startTransition(async () => {
                      try {
                        const res = await getCurrentWeekStartEt();
                        setWeekStart(res.weekStart);
                        setMsg({ tone: "success", text: "Loaded ET week start." });
                      } catch (e) {
                        setMsg({ tone: "error", text: e instanceof Error ? e.message : "Failed" });
                      }
                    });
                  }}
                >
                  {pending ? "Loading..." : "Load current ET week"}
                </Button>
              </div>
              <div className="flex items-end justify-end">
                {isOwner ? (
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setMsg(null);
                      startTransition(async () => {
                        try {
                          const res = await computeWeeklyAwards(null);
                          setComputedRows((res as any)?.rows ?? null);
                          setMsg({ tone: "success", text: "Awards computed." });
                        } catch (e) {
                          setMsg({ tone: "error", text: e instanceof Error ? e.message : "Compute failed" });
                        }
                      });
                    }}
                  >
                    {pending ? "Computing..." : "Compute Awards (last week)"}
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs font-semibold text-[color:var(--muted)] mb-1">Member</div>
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
              <div className="flex items-end justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending || !weekStart}
                  onClick={() => {
                    setMsg(null);
                    startTransition(async () => {
                      try {
                        const res = await previewWeeklyAwardsMetrics(weekStart);
                        setMetricsRows((res as any)?.rows ?? []);
                        setMsg({ tone: "success", text: "Preview loaded." });
                      } catch (e) {
                        setMsg({ tone: "error", text: e instanceof Error ? e.message : "Preview failed" });
                      }
                    });
                  }}
                >
                  {pending ? "Loading..." : "Preview week"}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={showedUp} onChange={(e) => setShowedUp(e.target.checked)} />
                Showed up
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={helpedOthers} onChange={(e) => setHelpedOthers(e.target.checked)} />
                Helped others
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={goodVibes} onChange={(e) => setGoodVibes(e.target.checked)} />
                Good vibes
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={problematic} onChange={(e) => setProblematic(e.target.checked)} />
                Problematic
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Input
                label="External gifts (coins)"
                value={externalGiftsCoins}
                onChange={(e) => setExternalGiftsCoins(e.target.value)}
                placeholder="0"
              />
              <Input
                label="External snipes (coins)"
                value={externalSnipesCoins}
                onChange={(e) => setExternalSnipesCoins(e.target.value)}
                placeholder="0"
              />
            </div>

            <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />

            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                disabled={pending || !weekStart || !awardUserId}
                onClick={() => {
                  setMsg(null);
                  startTransition(async () => {
                    try {
                      const fd = new FormData();
                      fd.set("week_start", weekStart);
                      fd.set("user_id", awardUserId);
                      fd.set("showed_up", showedUp ? "1" : "0");
                      fd.set("helped_others", helpedOthers ? "1" : "0");
                      fd.set("good_vibes", goodVibes ? "1" : "0");
                      fd.set("problematic", problematic ? "1" : "0");
                      fd.set("external_gifts_coins", externalGiftsCoins);
                      fd.set("external_snipes_coins", externalSnipesCoins);
                      fd.set("notes", notes);
                      await upsertWeeklyAwardsInput(fd);
                      setMsg({ tone: "success", text: "Saved." });
                    } catch (e) {
                      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Save failed" });
                    }
                  });
                }}
              >
                {pending ? "Saving..." : "Save input"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  setMetricsRows(null);
                  setComputedRows(null);
                }}
              >
                Clear preview
              </Button>
            </div>

            {metricsRows ? (
              <div className="rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] p-3">
                <div className="text-xs font-semibold text-[color:var(--muted)] mb-2">Top candidates (preview)</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { key: "mvp_score", label: "MVP" },
                    { key: "top_supporter_score", label: "Top Supporter" },
                    { key: "top_sniper_score", label: "Top Sniper" },
                    { key: "chatterbox_score", label: "Chatterbox" },
                    { key: "hype_machine_score", label: "Hype Machine" },
                    { key: "streak_champion_score", label: "Streak Champion" },
                  ].map((k) => {
                    const top = [...metricsRows]
                      .sort((a, b) => Number(b?.[k.key] ?? 0) - Number(a?.[k.key] ?? 0))
                      .slice(0, 3);
                    return (
                      <div key={k.key} className="rounded-lg border border-[color:var(--border)] p-2">
                        <div className="font-semibold">{k.label}</div>
                        <div className="mt-1 space-y-1">
                          {top.map((r: any) => (
                            <div key={String(r.user_id)} className="flex items-center justify-between gap-2">
                              <span className="truncate">{String(r.user_id).slice(0, 8)}…</span>
                              <span className="text-[color:var(--muted)]">{Number(r?.[k.key] ?? 0).toFixed(1)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {computedRows ? (
              <div className="rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] p-3">
                <div className="text-xs font-semibold text-[color:var(--muted)] mb-2">Computed winners</div>
                <div className="space-y-1.5 text-sm">
                  {(computedRows ?? []).map((r: any) => (
                    <div key={String(r.id)} className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{String(r.award_key)}</span>
                      <span className="text-[color:var(--muted)]">{String(r.user_id).slice(0, 8)}…</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      )}

      {activeTab === "roles" && (
        <Card title={isOwner ? "Admin & Moderator Roles" : "Moderator Roles"}>
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
              {isOwner && (
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
              )}
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
                        {/* Owner can remove anyone except owner, Admin can only remove moderators */}
                        {role === "owner" ? null : (role === "admin" && !isOwner) ? null : (
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
