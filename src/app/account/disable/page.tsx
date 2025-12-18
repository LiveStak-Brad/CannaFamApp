import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { DisableAccountForm } from "./ui";

export const runtime = "nodejs";

export default async function DisableAccountPage() {
  await requireUser();

  return (
    <Container>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-red-400">Disable Account</h1>
          <p className="text-sm text-[color:var(--muted)]">
            This action will disable your account.
          </p>
        </div>

        <Card title="⚠️ Are you sure?">
          <div className="space-y-4">
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm">
              <p className="font-medium text-yellow-400 mb-2">What happens when you disable your account:</p>
              <ul className="list-disc list-inside space-y-1 text-[color:var(--muted)]">
                <li>Your profile will be hidden from other users</li>
                <li>You will be logged out immediately</li>
                <li>You will not be able to log in until your account is re-enabled</li>
                <li>Your posts and data will be preserved</li>
              </ul>
            </div>

            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-sm">
              <p className="font-medium text-green-400 mb-2">How to re-enable your account:</p>
              <p className="text-[color:var(--muted)]">
                Contact us at <a href="mailto:support@cannafamapp.com" className="text-green-400 underline">support@cannafamapp.com</a> with 
                the email address associated with your account. We will verify your identity and re-enable your account within 24-48 hours.
              </p>
            </div>

            <DisableAccountForm />
          </div>
        </Card>
      </div>
    </Container>
  );
}
