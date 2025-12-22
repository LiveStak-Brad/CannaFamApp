import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { requireUser, getMyAdminRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { ModeratorClient } from "./ui";

export const runtime = "nodejs";

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

export default async function ModeratorPage() {
  const user = await requireUser();
  const role = await getMyAdminRole();

  // Only mods can access this page
  if (role !== "owner" && role !== "admin" && role !== "moderator") {
    redirect("/");
  }

  const sb = await supabaseServer();

  // Fetch reports
  const { data: reports } = await sb.rpc("cfm_list_reports", {
    p_status: null,
    p_limit: 100,
    p_offset: 0,
  });

  const typedReports = (reports ?? []) as ReportRow[];

  return (
    <Container>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">🚨 Moderator Dashboard</h1>
          <p className="text-sm text-[color:var(--muted)]">
            Review flagged content and take action.
          </p>
        </div>

        <Card>
          <ModeratorClient reports={typedReports} myUserId={user.id} />
        </Card>
      </div>
    </Container>
  );
}
