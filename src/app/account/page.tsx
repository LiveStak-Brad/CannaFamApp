import Link from "next/link";
import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { AccountPasswordForm } from "./ui";

export const runtime = "nodejs";

export default async function AccountPage() {
  await requireUser();

  return (
    <Container>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Account</h1>
          <p className="text-sm text-[color:var(--muted)]">
            Manage your sign-in settings.
          </p>
        </div>

        <Card title="Password">
          <AccountPasswordForm />
        </Card>

        <Card title="Danger Zone">
          <div className="space-y-3">
            <p className="text-sm text-[color:var(--muted)]">
              Disabling your account will hide your profile and prevent you from logging in.
              You can re-enable it by contacting support.
            </p>
            <Link
              href="/account/disable"
              className="inline-block rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20 transition"
            >
              Disable Account
            </Link>
          </div>
        </Card>
      </div>
    </Container>
  );
}
