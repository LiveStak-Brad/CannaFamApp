import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const runtime = "nodejs";

export default async function SupportPage() {
  return (
    <Container>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Support &amp; Help</h1>
          <p className="text-sm text-[color:var(--muted)]">
            Need help with the CannaFam app? We’re here to help with account issues, bugs, and general questions.
          </p>
        </div>

        <Card title="Contact Support">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <div className="text-[color:var(--foreground)]">Email us at:</div>
            <a
              href="mailto:support@cannafamapp.com"
              className="inline-block rounded-lg bg-[color:var(--accent)] px-4 py-2 font-medium text-white"
            >
              support@cannafamapp.com
            </a>
            <div>
              Use this for account issues, login problems, app bugs, billing / gifting questions, and general app questions.
            </div>
          </div>
        </Card>

        <Card title="Report a Bug">
          <div className="space-y-2 text-sm text-[color:var(--muted)]">
            <div>When emailing support, please include:</div>
            <div>What you were doing</div>
            <div>What went wrong (error message, screenshot, or steps to reproduce)</div>
            <div>Your device + OS/browser details</div>
            <div className="pt-2">
              <Button as="link" href="mailto:support@cannafamapp.com?subject=Bug%20Report" variant="secondary">
                Report a Bug
              </Button>
            </div>
          </div>
        </Card>

        <Card title="Moderation &amp; Safety">
          <div className="space-y-2 text-sm text-[color:var(--muted)]">
            <div>To report users or content, use the in-app report buttons.</div>
            <div>For urgent issues, contact support.</div>
          </div>
        </Card>

        <Card title="Legal">
          <div className="space-y-3 text-sm">
            <a href="/terms" className="block text-[color:var(--accent)] underline underline-offset-4">
              Terms of Service
            </a>
            <a href="/privacy" className="block text-[color:var(--accent)] underline underline-offset-4">
              Privacy Policy
            </a>
            <a href="/community-guidelines" className="block text-[color:var(--accent)] underline underline-offset-4">
              Community Guidelines
            </a>
          </div>
        </Card>
      </div>
    </Container>
  );
}
