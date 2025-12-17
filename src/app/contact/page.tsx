import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";

export const runtime = "nodejs";

export const metadata = {
  title: "Contact & Support | CannaFam",
  description: "Get help and support for CannaFam",
};

export default function ContactPage() {
  return (
    <Container>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Contact & Support</h1>
          <p className="text-[color:var(--muted)]">
            Need help? We're here for you.
          </p>
        </div>

        <Card title="📧 Email Support">
          <div className="space-y-3 text-sm">
            <p className="text-[color:var(--muted)]">
              For general inquiries, account issues, or technical support:
            </p>
            <a
              href="mailto:support@cannafam.com"
              className="inline-block rounded-lg bg-[color:var(--accent)] px-4 py-2 font-medium text-white hover:opacity-90"
            >
              support@cannafam.com
            </a>
          </div>
        </Card>

        <Card title="🐛 Report a Bug">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              Found something that doesn't work right? Please include:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>What you were trying to do</li>
              <li>What happened instead</li>
              <li>Your device and browser/app version</li>
              <li>Screenshots if possible</li>
            </ul>
            <a
              href="mailto:bugs@cannafam.com?subject=Bug%20Report"
              className="inline-block rounded-lg border border-white/10 bg-white/5 px-4 py-2 font-medium hover:bg-white/10"
            >
              Report a Bug
            </a>
          </div>
        </Card>

        <Card title="💡 Feature Requests">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              Have an idea to make CannaFam better? We'd love to hear it!
            </p>
            <a
              href="mailto:feedback@cannafam.com?subject=Feature%20Request"
              className="inline-block rounded-lg border border-white/10 bg-white/5 px-4 py-2 font-medium hover:bg-white/10"
            >
              Submit Feedback
            </a>
          </div>
        </Card>

        <Card title="⚠️ Report Content">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              To report content that violates our{" "}
              <a href="/safety" className="text-[color:var(--accent)] underline">
                Community Guidelines
              </a>
              , please email us with details about the content and why it should be reviewed.
            </p>
            <a
              href="mailto:safety@cannafam.com?subject=Content%20Report"
              className="inline-block rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 font-medium text-red-400 hover:bg-red-500/20"
            >
              Report Content
            </a>
          </div>
        </Card>

        <Card title="📱 App Information">
          <div className="space-y-2 text-sm text-[color:var(--muted)]">
            <p><strong>App Name:</strong> CannaFam</p>
            <p><strong>Version:</strong> 1.0.0</p>
            <p><strong>Developer:</strong> CannaFam LLC</p>
          </div>
        </Card>

        <div className="border-t border-white/10 pt-6">
          <h2 className="mb-3 text-lg font-semibold">Legal</h2>
          <div className="flex flex-wrap gap-4 text-sm">
            <a href="/terms" className="text-[color:var(--accent)] hover:underline">
              Terms of Service
            </a>
            <a href="/privacy" className="text-[color:var(--accent)] hover:underline">
              Privacy Policy
            </a>
            <a href="/safety" className="text-[color:var(--accent)] hover:underline">
              Community Guidelines
            </a>
          </div>
        </div>

        <div className="text-center text-xs text-[color:var(--muted)]">
          <p>Response time: Usually within 24-48 hours</p>
        </div>
      </div>
    </Container>
  );
}
