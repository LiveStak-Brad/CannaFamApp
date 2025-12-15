import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { getAuthedUserOrNull } from "@/lib/auth";

export const runtime = "nodejs";

export default async function ApplyPage() {
  const user = await getAuthedUserOrNull();

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
          <h1 className="text-xl font-semibold">📝 Applications</h1>
          <p className="text-sm text-[color:var(--muted)]">
            Applications are no longer required. Create an account, then create your profile.
          </p>
        </div>

        <Card>
          <div className="space-y-3">
            <div className="text-sm text-[color:var(--muted)]">
              {user
                ? "You're signed in. Next: create your profile so you can earn points."
                : "Start by creating an account (email verification required)."}
            </div>
            <div className="grid grid-cols-1 gap-2">
              {!user ? (
                <Button as="link" href="/signup" variant="primary">
                  Create account
                </Button>
              ) : null}
              {!user ? (
                <Button as="link" href="/login" variant="secondary">
                  Sign in
                </Button>
              ) : null}
              {user ? (
                <Button as="link" href="/hub/claim" variant="secondary">
                  Create profile
                </Button>
              ) : null}
              <Button as="link" href="/members" variant="secondary">
                View Member Roster
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </Container>
  );
}
