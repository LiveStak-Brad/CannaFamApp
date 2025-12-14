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
      </div>
    </Container>
  );
}
