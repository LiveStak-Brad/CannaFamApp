import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { getAuthedUserOrNull } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { ApplyForm } from "./ui";

export const runtime = "nodejs";

export default async function ApplyPage() {
  const sb = await supabaseServer();
  const user = await getAuthedUserOrNull();

  const { data: member } = user
    ? await sb.from("cfm_members").select("id").eq("user_id", user.id).maybeSingle()
    : { data: null };

  const isLinkedMember = !!user && !!member;

  return (
    <Container>
      <div className="space-y-4">
        <div className="relative mx-auto aspect-square w-[160px] overflow-hidden rounded-full">
          <Image
            src="/marketing.png"
            alt="CannaFam"
            fill
            sizes="160px"
            className="object-cover"
            priority
          />
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(7,10,8,0) 32%, rgba(7,10,8,0.92) 68%, rgba(7,10,8,1) 100%)",
            }}
          />
        </div>

        <div className="space-y-1">
          <h1 className="text-xl font-semibold">📝 Apply</h1>
          <p className="text-sm text-[color:var(--muted)]">
            Submit your Favorited username and a short bio. Applications start as
            pending.
          </p>
        </div>

        <Card>
          {isLinkedMember ? (
            <div className="space-y-3">
              <div className="text-sm font-semibold">You're already a member ✅</div>
              <div className="text-sm text-[color:var(--muted)]">
                You don’t need to apply again.
              </div>
              <div className="grid grid-cols-1 gap-2">
                <Button as="link" href="/hub" variant="secondary">
                  Go to Hub
                </Button>
                <Button as="link" href="/leaderboard" variant="secondary">
                  View Leaderboard
                </Button>
                <Button as="link" href="/members" variant="secondary">
                  View Members
                </Button>
              </div>
            </div>
          ) : (
            <ApplyForm authedEmail={user?.email ?? null} />
          )}
        </Card>
      </div>
    </Container>
  );
}
