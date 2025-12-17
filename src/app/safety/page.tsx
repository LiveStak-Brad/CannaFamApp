import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";

export const runtime = "nodejs";

export const metadata = {
  title: "Community Guidelines | CannaFam",
  description: "Community Guidelines and Safety for CannaFam",
};

export default function SafetyPage() {
  return (
    <Container>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">🛡️ Community Guidelines</h1>
          <p className="text-sm text-[color:var(--muted)]">
            Last updated: December 17, 2024
          </p>
        </div>

        <Card title="Our Community Values">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              CannaFam is built on respect, authenticity, and community. We're committed to creating 
              a safe and welcoming environment for all members. These guidelines help ensure everyone 
              can enjoy our platform.
            </p>
          </div>
        </Card>

        <Card title="Be Respectful">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>Treat others the way you want to be treated:</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Be kind and courteous to other community members</li>
              <li>Respect different opinions and perspectives</li>
              <li>Engage in constructive conversations</li>
              <li>Give credit where credit is due</li>
              <li>Celebrate others' achievements</li>
            </ul>
          </div>
        </Card>

        <Card title="Prohibited Content">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>The following content is strictly prohibited:</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li><strong className="text-[color:var(--foreground)]">Hate Speech:</strong> Content that promotes hatred or violence against individuals or groups based on race, ethnicity, religion, gender, sexual orientation, disability, or other characteristics</li>
              <li><strong className="text-[color:var(--foreground)]">Harassment:</strong> Bullying, intimidation, stalking, or targeting individuals</li>
              <li><strong className="text-[color:var(--foreground)]">Violence:</strong> Threats of violence, glorification of violence, or graphic violent content</li>
              <li><strong className="text-[color:var(--foreground)]">Illegal Content:</strong> Content promoting illegal activities or substances</li>
              <li><strong className="text-[color:var(--foreground)]">Sexual Content:</strong> Explicit sexual content or nudity</li>
              <li><strong className="text-[color:var(--foreground)]">Minor Safety:</strong> Any content involving minors in inappropriate contexts</li>
              <li><strong className="text-[color:var(--foreground)]">Misinformation:</strong> Deliberately false or misleading information</li>
              <li><strong className="text-[color:var(--foreground)]">Spam:</strong> Repetitive, unsolicited, or promotional content</li>
              <li><strong className="text-[color:var(--foreground)]">Impersonation:</strong> Pretending to be someone else</li>
              <li><strong className="text-[color:var(--foreground)]">Doxxing:</strong> Sharing private information without consent</li>
            </ul>
          </div>
        </Card>

        <Card title="Live Streaming Guidelines">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>When participating in live streams:</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Follow all community guidelines during streams</li>
              <li>Do not stream illegal activities</li>
              <li>Do not target or harass other users</li>
              <li>Respect the streamer and other viewers</li>
              <li>Do not share personal information of others</li>
              <li>Report inappropriate behavior to moderators</li>
            </ul>
            <p className="pt-2">
              Streamers are responsible for the content of their streams and may be held accountable 
              for violations that occur during their broadcasts.
            </p>
          </div>
        </Card>

        <Card title="Age Requirement">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              <strong className="text-[color:var(--foreground)]">You must be 21 years or older to use CannaFam.</strong>
            </p>
            <p>
              We take age verification seriously. Accounts found to belong to users under 21 will be 
              immediately terminated. If you encounter a user who appears to be underage, please 
              report them immediately.
            </p>
          </div>
        </Card>

        <Card title="Reporting Violations">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              If you see content or behavior that violates these guidelines, please report it:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Email us at support@cannafamapp.com</li>
              <li>Include details about the violation</li>
              <li>Provide screenshots if possible</li>
              <li>Include the username of the violator</li>
            </ul>
            <p className="pt-2">
              All reports are reviewed by our team and handled confidentially. We do not disclose 
              the identity of reporters.
            </p>
          </div>
        </Card>

        <Card title="Enforcement">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              Violations of these guidelines may result in:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li><strong className="text-[color:var(--foreground)]">Warning:</strong> First-time minor violations may receive a warning</li>
              <li><strong className="text-[color:var(--foreground)]">Content Removal:</strong> Violating content will be removed</li>
              <li><strong className="text-[color:var(--foreground)]">Temporary Suspension:</strong> Repeated violations may result in temporary account suspension</li>
              <li><strong className="text-[color:var(--foreground)]">Permanent Ban:</strong> Severe or repeated violations will result in permanent account termination</li>
              <li><strong className="text-[color:var(--foreground)]">Legal Action:</strong> Illegal activities may be reported to law enforcement</li>
            </ul>
            <p className="pt-2">
              We reserve the right to take action at our discretion, including immediate termination 
              for severe violations.
            </p>
          </div>
        </Card>

        <Card title="Safety Tips">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>Protect yourself online:</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Never share your password with anyone</li>
              <li>Be cautious about sharing personal information</li>
              <li>Use a strong, unique password</li>
              <li>Enable two-factor authentication if available</li>
              <li>Be skeptical of requests for money or personal information</li>
              <li>Trust your instincts - if something feels wrong, report it</li>
            </ul>
          </div>
        </Card>

        <Card title="Mental Health Resources">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              If you or someone you know is struggling, please reach out for help:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li><strong className="text-[color:var(--foreground)]">National Suicide Prevention Lifeline:</strong> 988</li>
              <li><strong className="text-[color:var(--foreground)]">Crisis Text Line:</strong> Text HOME to 741741</li>
              <li><strong className="text-[color:var(--foreground)]">SAMHSA National Helpline:</strong> 1-800-662-4357</li>
            </ul>
            <p className="pt-2">
              You are not alone. Help is available 24/7.
            </p>
          </div>
        </Card>

        <Card title="Contact Us">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              Questions about these guidelines? Contact us at:
            </p>
            <p>
              <strong className="text-[color:var(--foreground)]">Email:</strong> support@cannafamapp.com
            </p>
          </div>
        </Card>
      </div>
    </Container>
  );
}
