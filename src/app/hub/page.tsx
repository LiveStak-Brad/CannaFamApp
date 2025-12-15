import Link from "next/link";
import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import { todayISODate } from "@/lib/utils";
import { PointsExplainerButton } from "@/components/ui/points-explainer";
import { updateMyProfile } from "./actions";
import { HubCheckInButton, HubSpinButton } from "./ui";

export const runtime = "nodejs";

type MemberProfile = {
  id: string;
  favorited_username: string;
  photo_url: string | null;
  bio: string | null;
  public_link: string | null;
  instagram_link: string | null;
  x_link: string | null;
  tiktok_link: string | null;
  youtube_link: string | null;
};

export default async function HubPage() {
  const user = await requireUser();
  const sb = await supabaseServer();

  const { data: adminRow } = await sb
    .from("cfm_admins")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  const isAdmin = !!adminRow?.role;

  let autoLinkDebug: string | null = null;

  let { data: memberRaw } = await sb
    .from("cfm_members")
    .select("id,favorited_username,photo_url,bio,public_link,instagram_link,x_link,tiktok_link,youtube_link")
    .eq("user_id", user.id)
    .maybeSingle();

  let member = (memberRaw as unknown as MemberProfile | null) ?? null;

  if (!isAdmin && !member) {
    const email = (user.email ?? "").toLowerCase().trim();
    if (!email) {
      autoLinkDebug = "Auto-link: your auth account has no email.";
    }
    if (email) {
      const admin = supabaseAdmin();
      const { data: app, error: appErr } = await admin
        .from("cfm_applications")
        .select("favorited_username")
        .eq("status", "approved")
        .ilike("email", email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (appErr) {
        autoLinkDebug = `Auto-link: application lookup error (${appErr.message}).`;
      } else if (!app?.favorited_username) {
        autoLinkDebug = "Auto-link: no approved application found for this email.";
      }

      if (app?.favorited_username) {
        const { data: m, error: memberLookupErr } = await admin
          .from("cfm_members")
          .select("id,user_id")
          .eq("favorited_username", app.favorited_username)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (memberLookupErr) {
          autoLinkDebug = `Auto-link: member lookup error (${memberLookupErr.message}).`;
        } else if (!m) {
          autoLinkDebug = "Auto-link: approved application found, but no member record exists yet.";
        } else if (m.user_id && m.user_id !== user.id) {
          autoLinkDebug = "Auto-link: member record is already linked to another account.";
        }

        if (m && !m.user_id) {
          const { error: updateErr } = await admin
            .from("cfm_members")
            .update({ user_id: user.id })
            .eq("id", m.id)
            .is("user_id", null);

          if (updateErr) {
            autoLinkDebug = `Auto-link: failed to link (${updateErr.message}).`;
          } else {
            autoLinkDebug = "Auto-link: linked successfully. Refreshing...";
          }
        }

        const refetch = await sb
          .from("cfm_members")
          .select("id,favorited_username,photo_url,bio,public_link,instagram_link,x_link,tiktok_link,youtube_link")
          .eq("user_id", user.id)
          .maybeSingle();
        member = (refetch.data as unknown as MemberProfile | null) ?? null;
      }
    }
  }

  const approved = isAdmin || !!member;

  const today = todayISODate();
  const { data: checkedToday } = approved
    ? await sb
        .from("cfm_checkins")
        .select("id")
        .eq("user_id", user.id)
        .eq("checkin_date", today)
        .maybeSingle()
    : { data: null };

  const { data: spunToday } = approved
    ? await sb
        .from("cfm_daily_spins")
        .select("id, points_awarded")
        .eq("user_id", user.id)
        .eq("spin_date", today)
        .maybeSingle()
    : { data: null };

  const { data: leaderboard } = approved
    ? await sb.rpc("cfm_leaderboard", { limit_n: 10 })
    : { data: null };

  const userTotals = Array.isArray(leaderboard)
    ? leaderboard.find((r: any) => r.user_id === user.id) ?? null
    : null;

  return (
    <Container>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">👤 Hub</h1>
          <p className="text-sm text-[color:var(--muted)]">
            Signed in as {user.email ?? ""}.
          </p>
        </div>

        {!approved ? (
          <Card title="Approval required">
            <div className="space-y-3 text-sm text-[color:var(--muted)]">
              <p>
                Your account is not approved yet. Once an admin approves your CFM
                application, you'll have access to member pages.
              </p>
              {autoLinkDebug ? (
                <p className="text-xs">{autoLinkDebug}</p>
              ) : null}
              <div className="grid grid-cols-1 gap-3">
                <Button as="link" href="/hub/claim" variant="secondary">
                  Claim membership
                </Button>
              </div>
            </div>
          </Card>
        ) : null}

        {approved ? (
          <Card title="Profile">
            <div className="space-y-3">
              {member?.photo_url ? (
                <div className="flex items-center gap-3">
                  <img
                    src={member.photo_url}
                    alt={member.favorited_username ?? "Member"}
                    className="h-12 w-12 rounded-full border border-[color:var(--border)] object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="text-sm font-semibold">
                    {member.favorited_username ?? "Member"}
                  </div>
                </div>
              ) : member?.favorited_username ? (
                <div className="text-sm font-semibold">{member.favorited_username}</div>
              ) : null}

              <form
                action={updateMyProfile}
                method="post"
                encType="multipart/form-data"
                className="space-y-3"
              >
                <Input
                  label="Favorited username"
                  name="favorited_username"
                  defaultValue={member?.favorited_username ?? ""}
                  required
                  placeholder="Your Favorited username"
                />
                <div className="space-y-1">
                  <div className="text-sm font-medium">Profile photo</div>
                  <input
                    type="file"
                    name="photo"
                    accept="image/*"
                    className="block w-full text-sm text-[color:var(--muted)] file:mr-3 file:rounded-lg file:border file:border-[color:var(--border)] file:bg-black/20 file:px-3 file:py-2 file:text-sm file:text-[color:var(--foreground)]"
                  />
                  <div className="text-xs text-[color:var(--muted)]">
                    Upload a new photo to replace your current one.
                  </div>
                </div>
                <Textarea
                  label="Bio"
                  name="bio"
                  defaultValue={member?.bio ?? ""}
                  placeholder="Add a short bio for your mini profile"
                />

                <Input
                  label="Link"
                  name="public_link"
                  defaultValue={member?.public_link ?? ""}
                  placeholder="https://..."
                />

                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Instagram"
                    name="instagram_link"
                    defaultValue={member?.instagram_link ?? ""}
                    placeholder="@handle or URL"
                  />
                  <Input
                    label="X"
                    name="x_link"
                    defaultValue={member?.x_link ?? ""}
                    placeholder="@handle or URL"
                  />
                  <Input
                    label="TikTok"
                    name="tiktok_link"
                    defaultValue={member?.tiktok_link ?? ""}
                    placeholder="@handle or URL"
                  />
                  <Input
                    label="YouTube"
                    name="youtube_link"
                    defaultValue={member?.youtube_link ?? ""}
                    placeholder="@handle or URL"
                  />
                </div>
                <Button type="submit" variant="secondary">
                  Save profile
                </Button>
              </form>
            </div>
          </Card>
        ) : null}

        <Card title="Daily Spin">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">🎡 Spin for points</div>
              <div className="mt-1 text-xs text-[color:var(--muted)]">
                One spin per day. You can earn 1–5 points.
              </div>
              {spunToday ? (
                <div className="mt-2 text-sm font-semibold">
                  Today: +{spunToday.points_awarded ?? 0}
                </div>
              ) : null}
            </div>
            <HubSpinButton disabled={!approved} spunToday={!!spunToday} />
          </div>
        </Card>

        <Card title="Your points">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-semibold">
                {isAdmin ? "Admin" : userTotals?.total_points ?? 0}
              </div>
              {!isAdmin ? (
                <div className="mt-1 text-sm font-semibold">
                  🔥 Streak (consecutive check-in days): {userTotals?.streak_points ?? 0}
                </div>
              ) : null}
              <div className="mt-1 text-xs text-[color:var(--muted)]">
                Daily check-in: +1/day
              </div>
              <div className="mt-3">
                <PointsExplainerButton />
              </div>
            </div>
            <HubCheckInButton disabled={!approved} checkedToday={!!checkedToday} />
          </div>
        </Card>

        <Card title="Weekly leaderboard">
          <div className="space-y-2">
            {leaderboard?.length ? (
              leaderboard.map((m: any, idx: number) => (
                <div
                  key={m.user_id}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="min-w-0">
                    <span className="text-[color:var(--muted)]">#{idx + 1}</span>{" "}
                    <span className="font-semibold">{m.favorited_username}</span>
                    <span className="ml-2 text-xs text-[color:var(--muted)]">
                      🔥 {m.streak_points ?? 0}
                    </span>
                  </div>
                  <div className="font-semibold">{m.total_points ?? 0}</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-[color:var(--muted)]">
                No leaderboard entries yet.
              </div>
            )}

            <div className="pt-2">
              <Button as="link" href="/leaderboard" variant="secondary">
                View full leaderboard
              </Button>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-3">
          <Button as="link" href="/support" variant="secondary">
            Support
          </Button>
          <Button as="link" href="/feed" variant="secondary">
            Highlight feed
          </Button>
          {isAdmin ? (
            <Button as="link" href="/admin" variant="secondary">
              Admin
            </Button>
          ) : null}
          <Link href="/" className="text-center text-xs text-[color:var(--muted)] underline underline-offset-4">
            Back to home
          </Link>
        </div>
      </div>
    </Container>
  );
}
