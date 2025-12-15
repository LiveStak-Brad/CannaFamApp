import Link from "next/link";
import { Container } from "@/components/shell/container";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requireApprovedMember } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { updateMyProfile } from "@/app/hub/actions";

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

export default async function MePage() {
  const user = await requireApprovedMember();
  const sb = await supabaseServer();

  const { data: memberRaw } = await sb
    .from("cfm_members")
    .select(
      "id,favorited_username,photo_url,bio,public_link,instagram_link,x_link,tiktok_link,youtube_link",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const member = (memberRaw as unknown as MemberProfile | null) ?? null;

  return (
    <Container>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">👤 My Profile</h1>
          <p className="text-sm text-[color:var(--muted)]">
            Update your photo, bio, and links.
          </p>
        </div>

        <Card title="Edit profile">
          <div className="space-y-3">
            {member?.photo_url ? (
              <div className="flex items-center gap-3">
                <img
                  src={member.photo_url}
                  alt={member.favorited_username ?? "Member"}
                  className="h-14 w-14 rounded-full border border-[color:var(--border)] object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {member.favorited_username ?? "Member"}
                  </div>
                  {member?.favorited_username ? (
                    <Link
                      href={`/u/${encodeURIComponent(member.favorited_username)}`}
                      className="text-xs text-[color:var(--muted)] underline underline-offset-4"
                    >
                      View public profile
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : member?.favorited_username ? (
              <div className="text-sm font-semibold">{member.favorited_username}</div>
            ) : (
              <div className="text-sm text-[color:var(--muted)]">
                Profile not found.
              </div>
            )}

            {member ? (
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
                  placeholder="Add a short bio for your profile"
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
            ) : (
              <div className="text-sm text-[color:var(--muted)]">
                Your member record is missing. Please contact an admin.
              </div>
            )}
          </div>
        </Card>
      </div>
    </Container>
  );
}
