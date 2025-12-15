import Link from "next/link";
import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { requireApprovedMember } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdminOrNull } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type PublicProfile = {
  user_id: string | null;
  favorited_username: string;
  photo_url: string | null;
  bio: string | null;
  public_link: string | null;
  instagram_link: string | null;
  x_link: string | null;
  tiktok_link: string | null;
  youtube_link: string | null;
};

type FeedComment = {
  id: string;
  post_id: string | null;
  content: string;
  created_at: string | null;
  is_hidden?: boolean | null;
};

function fmtTime(iso: string | null) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default async function UserProfilePage({
  params,
}: {
  params: { username: string };
}) {
  await requireApprovedMember();
  const sb = await supabaseServer();
  const admin = supabaseAdminOrNull();

  let uname = String(params.username ?? "");
  try {
    uname = decodeURIComponent(uname);
  } catch {
  }
  uname = uname.trim();

  if (!uname) {
    return (
      <Container>
        <Card title="Profile">
          <div className="text-sm text-[color:var(--muted)]">Invalid profile URL.</div>
          <div className="mt-2 text-xs text-[color:var(--muted)]">
            Lookup: <span className="font-mono">{uname || "(empty)"}</span>
          </div>
          <div className="mt-2 text-xs text-[color:var(--muted)]">
            Params: <span className="font-mono">{JSON.stringify(params)}</span>
          </div>
        </Card>
      </Container>
    );
  }

  const profileFields =
    "user_id,favorited_username,photo_url,bio,public_link,instagram_link,x_link,tiktok_link,youtube_link";

  let profile: PublicProfile | null = null;
  let lookupErrMsg = "";

  if (admin) {
    const exactRes = await admin
      .from("cfm_members")
      .select(profileFields)
      .eq("favorited_username", uname)
      .order("created_at", { ascending: false })
      .limit(1);

    const exactRows = (exactRes.data ?? []) as any[];
    if (exactRes.error) lookupErrMsg = exactRes.error.message;

    if (exactRows.length) {
      profile = (exactRows[0] as unknown as PublicProfile) ?? null;
    } else {
      const likeRes = await admin
        .from("cfm_members")
        .select(profileFields)
        .ilike("favorited_username", uname)
        .order("created_at", { ascending: false })
        .limit(1);
      const likeRows = (likeRes.data ?? []) as any[];
      if (likeRes.error) lookupErrMsg = likeRes.error.message;
      profile = (likeRows[0] as unknown as PublicProfile) ?? null;
    }
  } else {
    const rpcRes = await sb.rpc("cfm_get_member_profile", { username: uname });
    if (rpcRes.error) lookupErrMsg = rpcRes.error.message;
    const data = rpcRes.data as unknown;
    const rows = Array.isArray(data) ? (data as any[]) : data ? [data] : [];
    profile = (rows[0] as unknown as PublicProfile) ?? null;
  }

  lookupErrMsg = String(lookupErrMsg || "").trim();
  if (!profile?.favorited_username) {
    return (
      <Container>
        <Card title="Profile">
          <div className="text-sm text-[color:var(--muted)]">Member not found.</div>
          <div className="mt-2 text-xs text-[color:var(--muted)]">
            Lookup: <span className="font-mono">{uname || "(empty)"}</span>
          </div>
          {lookupErrMsg ? (
            <div className="mt-2 text-xs text-[color:var(--muted)]">{lookupErrMsg}</div>
          ) : null}
        </Card>
      </Container>
    );
  }

  const linkedUserId = String(profile.user_id ?? "").trim() || null;

  let pointsRow: any | null = null;
  if (linkedUserId) {
    try {
      const { data: lb } = await sb.rpc("cfm_leaderboard", { limit_n: 500 });
      const rows = (lb ?? []) as any[];
      pointsRow = rows.find((r) => String(r.user_id) === String(linkedUserId)) ?? null;
    } catch {
      pointsRow = null;
    }
  }

  let comments: FeedComment[] = [];
  if (linkedUserId) {
    const { data: commentRows } = await sb
      .from("cfm_feed_comments")
      .select("id,post_id,content,created_at,is_hidden")
      .eq("user_id", linkedUserId)
      .or("is_hidden.is.null,is_hidden.eq.false")
      .order("created_at", { ascending: false })
      .limit(20);
    comments = (commentRows ?? []) as unknown as FeedComment[];
  }

  const socials: Array<{ label: string; href: string }> = [];
  if (profile?.public_link) socials.push({ label: "Link", href: profile.public_link });
  if (profile?.instagram_link) socials.push({ label: "IG", href: profile.instagram_link });
  if (profile?.x_link) socials.push({ label: "X", href: profile.x_link });
  if (profile?.tiktok_link) socials.push({ label: "TikTok", href: profile.tiktok_link });
  if (profile?.youtube_link) socials.push({ label: "YouTube", href: profile.youtube_link });

  return (
    <Container>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">👤 {profile.favorited_username}</h1>
          <p className="text-sm text-[color:var(--muted)]">Member profile</p>
        </div>

        <Card title="Profile">
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              {profile?.photo_url ? (
                <img
                  src={profile.photo_url}
                  alt={profile.favorited_username}
                  className="h-20 w-20 rounded-full border border-[color:var(--border)] object-cover object-top"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full border border-[color:var(--border)] bg-[rgba(255,255,255,0.05)] text-2xl font-semibold">
                  {(profile?.favorited_username ?? "?").trim().slice(0, 1).toUpperCase()}
                </div>
              )}

              <div className="min-w-0 flex-1 space-y-2">
                {profile?.bio ? (
                  <div className="text-sm text-[color:var(--muted)] whitespace-pre-wrap">
                    {profile.bio}
                  </div>
                ) : (
                  <div className="text-sm text-[color:var(--muted)]">No bio yet.</div>
                )}

                {socials.length ? (
                  <div className="flex flex-wrap gap-2">
                    {socials.map((s) => (
                      <a
                        key={s.label}
                        href={s.href}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-[color:var(--border)] bg-[rgba(255,255,255,0.03)] px-2 py-1 text-xs"
                      >
                        {s.label}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            {pointsRow ? (
              <div className="rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                <div className="text-xs text-[color:var(--muted)]">Total points</div>
                <div className="mt-1 text-3xl font-semibold">{pointsRow.total_points ?? 0}</div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-[color:var(--muted)]">
                  <span>🔥 {pointsRow.streak_points ?? 0}</span>
                  <span>🔗 {pointsRow.share_points ?? 0}</span>
                  <span>❤️ {pointsRow.like_points ?? 0}</span>
                  {typeof pointsRow.comment_points !== "undefined" ? (
                    <span>💬 {pointsRow.comment_points ?? 0}</span>
                  ) : null}
                  {typeof pointsRow.comment_upvote_points !== "undefined" ? (
                    <span>⬆️ {pointsRow.comment_upvote_points ?? 0}</span>
                  ) : null}
                  <span>✅ {pointsRow.checkin_points ?? 0}</span>
                  <span>🎁 {pointsRow.gift_bonus_points ?? 0}</span>
                  <span>🎡 {pointsRow.spin_points ?? 0}</span>
                  {typeof pointsRow.link_visit_points !== "undefined" ? (
                    <span>🔎 {pointsRow.link_visit_points ?? 0}</span>
                  ) : null}
                  {typeof pointsRow.gift_dollar_points !== "undefined" ? (
                    <span>💰 {pointsRow.gift_dollar_points ?? 0}</span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </Card>

        <Card title="Recent comments">
          {!linkedUserId ? (
            <div className="text-sm text-[color:var(--muted)]">
              This member hasn’t linked their account yet.
            </div>
          ) : comments.length ? (
            <div className="space-y-3">
              {comments.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-[color:var(--muted)]">{fmtTime(c.created_at)}</div>
                    {c.post_id ? (
                      <Link
                        href={`/feed#${encodeURIComponent(String(c.post_id))}`}
                        className="text-xs text-[color:var(--muted)] underline underline-offset-4"
                      >
                        View
                      </Link>
                    ) : null}
                  </div>
                  <div className="mt-2 text-sm whitespace-pre-wrap">{c.content}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-[color:var(--muted)]">No comments yet.</div>
          )}
        </Card>
      </div>
    </Container>
  );
}
