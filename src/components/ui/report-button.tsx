"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { supabaseBrowser } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toast";

type ReportType = "harassment" | "hate" | "sexual" | "violence" | "spam" | "impersonation" | "child_safety" | "other";

const REPORT_TYPES: { value: ReportType; label: string }[] = [
  { value: "spam", label: "📧 Spam" },
  { value: "harassment", label: "🚫 Harassment" },
  { value: "hate", label: "🔥 Hate Speech" },
  { value: "sexual", label: "🔞 Sexual Content" },
  { value: "violence", label: "⚠️ Violence" },
  { value: "impersonation", label: "🎭 Impersonation" },
  { value: "child_safety", label: "🛡️ Child Safety" },
  { value: "other", label: "❓ Other" },
];

export function ReportButton({
  targetType,
  targetId,
  targetUserId,
  className,
}: {
  targetType: "post" | "comment" | "profile" | "live_chat" | "live_stream";
  targetId?: string | null;
  targetUserId?: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reportType, setReportType] = useState<ReportType>("spam");
  const [details, setDetails] = useState("");
  const [pending, startTransition] = useTransition();
  const sb = supabaseBrowser();

  const handleSubmit = () => {
    startTransition(async () => {
      try {
        const { data, error } = await sb.rpc("cfm_submit_report", {
          p_report_type: reportType,
          p_target_type: targetType,
          p_target_id: targetId ?? null,
          p_target_user_id: targetUserId ?? null,
          p_reason: reportType,
          p_details: details.trim() || null,
        });

        if (error) throw error;

        const result = data as { success?: boolean; error?: string };
        if (result?.error) throw new Error(result.error);

        toast("Report submitted. Thank you!", "success");
        setOpen(false);
        setDetails("");
        setReportType("spam");
      } catch (e: any) {
        toast(e?.message ?? "Failed to submit report", "error");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        className={`text-xs text-[color:var(--muted)] hover:text-red-400 transition ${className ?? ""}`}
        onClick={() => setOpen(true)}
        title="Report"
      >
        🚩
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            aria-label="Close report modal"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-md px-4 pb-4">
            <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card-solid)] p-4 shadow-xl">
              <div className="mb-3 text-sm font-semibold">🚩 Report Content</div>

              <div className="space-y-3">
                <div>
                  <div className="mb-1 text-xs font-semibold text-[color:var(--muted)]">
                    What's the issue?
                  </div>
                  <select
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value as ReportType)}
                    className="w-full rounded-lg bg-[color:var(--card)] px-3 py-2 text-sm text-[color:var(--foreground)] outline-none ring-1 ring-[color:var(--border)] focus:ring-purple-500"
                  >
                    {REPORT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="mb-1 text-xs font-semibold text-[color:var(--muted)]">
                    Additional details (optional)
                  </div>
                  <textarea
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    placeholder="Describe the issue..."
                    className="w-full rounded-lg bg-[color:var(--card)] px-3 py-2 text-sm text-[color:var(--foreground)] outline-none ring-1 ring-[color:var(--border)] focus:ring-purple-500 resize-none"
                    rows={3}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setOpen(false)}
                    disabled={pending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSubmit}
                    disabled={pending}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {pending ? "Submitting..." : "Submit Report"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
