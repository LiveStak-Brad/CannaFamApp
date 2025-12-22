"use client";

import { useState, useTransition } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

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

type Tab = "all" | "posts" | "comments" | "pending";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400",
  reviewed: "bg-blue-500/20 text-blue-400",
  actioned: "bg-green-500/20 text-green-400",
  dismissed: "bg-gray-500/20 text-gray-400",
};

const REPORT_TYPE_LABELS: Record<string, string> = {
  harassment: "🚫 Harassment",
  hate: "🔥 Hate Speech",
  sexual: "🔞 Sexual Content",
  violence: "⚠️ Violence",
  spam: "📧 Spam",
  impersonation: "🎭 Impersonation",
  child_safety: "🛡️ Child Safety",
  other: "❓ Other",
};

export function ModeratorClient({
  reports: initialReports,
  myUserId,
}: {
  reports: ReportRow[];
  myUserId: string;
}) {
  const [reports, setReports] = useState(initialReports);
  const [tab, setTab] = useState<Tab>("pending");
  const [pending, startTransition] = useTransition();
  const sb = supabaseBrowser();

  const filteredReports = reports.filter((r) => {
    if (tab === "pending") return r.status === "pending";
    if (tab === "posts") return r.target_type === "post";
    if (tab === "comments") return r.target_type === "comment";
    return true;
  });

  const pendingCount = reports.filter((r) => r.status === "pending").length;

  const handleReview = async (reportId: string, newStatus: "reviewed" | "dismissed") => {
    startTransition(async () => {
      try {
        const { data, error } = await sb.rpc("cfm_update_report_status", {
          p_report_id: reportId,
          p_status: newStatus,
          p_admin_notes: null,
        });
        if (error) throw error;
        setReports((prev) =>
          prev.map((r) =>
            r.id === reportId ? { ...r, status: newStatus, reviewed_at: new Date().toISOString() } : r
          )
        );
        toast(newStatus === "dismissed" ? "Report dismissed" : "Report marked reviewed", "success");
      } catch (e: any) {
        toast(e?.message ?? "Failed to update report", "error");
      }
    });
  };

  const handleRemoveContent = async (report: ReportRow) => {
    startTransition(async () => {
      try {
        if (report.target_type === "post" && report.target_id) {
          const { error } = await sb.rpc("cfm_mod_remove_post", {
            p_post_id: report.target_id,
            p_reason: `Flagged: ${report.reason}`,
            p_report_id: report.id,
          });
          if (error) throw error;
        } else if (report.target_type === "comment" && report.target_id) {
          const { error } = await sb.rpc("cfm_mod_remove_comment", {
            p_comment_id: report.target_id,
            p_reason: `Flagged: ${report.reason}`,
            p_report_id: report.id,
          });
          if (error) throw error;
        } else {
          throw new Error("Invalid content type");
        }
        setReports((prev) =>
          prev.map((r) =>
            r.id === report.id ? { ...r, status: "actioned", reviewed_at: new Date().toISOString() } : r
          )
        );
        toast("Content removed", "success");
      } catch (e: any) {
        toast(e?.message ?? "Failed to remove content", "error");
      }
    });
  };

  const tabClass = (t: Tab) =>
    `px-3 py-2 text-xs font-semibold rounded-xl border transition ${
      tab === t
        ? "border-purple-500 bg-purple-600 text-white"
        : "border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] text-[color:var(--muted)] hover:bg-[rgba(255,255,255,0.05)]"
    }`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={tabClass("pending")} onClick={() => setTab("pending")}>
          Pending {pendingCount > 0 && <span className="ml-1 text-xs">({pendingCount})</span>}
        </button>
        <button type="button" className={tabClass("posts")} onClick={() => setTab("posts")}>
          Posts
        </button>
        <button type="button" className={tabClass("comments")} onClick={() => setTab("comments")}>
          Comments
        </button>
        <button type="button" className={tabClass("all")} onClick={() => setTab("all")}>
          All
        </button>
      </div>

      {filteredReports.length === 0 ? (
        <div className="py-8 text-center text-sm text-[color:var(--muted)]">
          {tab === "pending" ? "🎉 No pending reports!" : "No reports found."}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReports.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[r.status] ?? ""}`}>
                      {r.status}
                    </span>
                    <span className="text-xs text-[color:var(--muted)]">
                      {r.target_type === "post" ? "📝 Post" : r.target_type === "comment" ? "💬 Comment" : r.target_type}
                    </span>
                  </div>
                  <div className="text-sm font-semibold">
                    {REPORT_TYPE_LABELS[r.report_type] ?? r.report_type}
                  </div>
                  <div className="text-xs text-[color:var(--muted)]">
                    Reported by <span className="font-semibold">{r.reporter_username}</span> •{" "}
                    {new Date(r.created_at).toLocaleDateString()}
                  </div>
                  {r.target_username && r.target_username !== "Unknown" && (
                    <div className="text-xs text-[color:var(--muted)]">
                      Target user: <span className="font-semibold">{r.target_username}</span>
                    </div>
                  )}
                </div>
              </div>

              {r.content_preview && (
                <div className="mt-2 rounded-lg bg-[rgba(0,0,0,0.2)] p-2 text-xs text-[color:var(--muted)]">
                  "{r.content_preview}"
                </div>
              )}

              {r.details && (
                <div className="mt-2 text-xs text-[color:var(--muted)]">
                  <span className="font-semibold">Details:</span> {r.details}
                </div>
              )}

              {r.status === "pending" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    className="text-xs"
                    onClick={() => handleReview(r.id, "reviewed")}
                    disabled={pending}
                  >
                    ✅ Mark Reviewed
                  </Button>
                  <Button
                    variant="secondary"
                    className="text-xs"
                    onClick={() => handleReview(r.id, "dismissed")}
                    disabled={pending}
                  >
                    ❌ Dismiss
                  </Button>
                  {(r.target_type === "post" || r.target_type === "comment") && r.target_id && (
                    <Button
                      variant="primary"
                      className="text-xs bg-red-600 hover:bg-red-700"
                      onClick={() => handleRemoveContent(r)}
                      disabled={pending}
                    >
                      🗑️ Remove Content
                    </Button>
                  )}
                </div>
              )}

              {r.status !== "pending" && r.reviewed_at && (
                <div className="mt-2 text-xs text-[color:var(--muted)]">
                  Reviewed {new Date(r.reviewed_at).toLocaleDateString()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
