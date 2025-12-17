import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";

export const runtime = "nodejs";

export const metadata = {
  title: "Privacy Policy | CannaFam",
  description: "Privacy Policy for CannaFam",
};

export default function PrivacyPage() {
  return (
    <Container>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">🔒 Privacy Policy</h1>
          <p className="text-sm text-[color:var(--muted)]">
            Last updated: December 17, 2024
          </p>
        </div>

        <Card title="Introduction">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              CannaFam ("we," "our," or "us") is committed to protecting your privacy. This Privacy 
              Policy explains how we collect, use, disclose, and safeguard your information when you 
              use our website and mobile applications (collectively, the "Service").
            </p>
            <p>
              Please read this Privacy Policy carefully. By using the Service, you consent to the 
              practices described in this policy.
            </p>
          </div>
        </Card>

        <Card title="Information We Collect">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p><strong className="text-[color:var(--foreground)]">Information You Provide:</strong></p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Account information (email address, username, password)</li>
              <li>Profile information (display name, bio, profile photo)</li>
              <li>Content you post (comments, messages, media)</li>
              <li>Communications with us (support requests, feedback)</li>
              <li>Payment information (processed by third-party providers)</li>
            </ul>
            
            <p className="pt-2"><strong className="text-[color:var(--foreground)]">Information Collected Automatically:</strong></p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Device information (device type, operating system, unique identifiers)</li>
              <li>Log data (IP address, browser type, pages visited, timestamps)</li>
              <li>Usage data (features used, interactions, preferences)</li>
              <li>Location data (general location based on IP address)</li>
            </ul>
          </div>
        </Card>

        <Card title="How We Use Your Information">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>We use the information we collect to:</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Provide, maintain, and improve the Service</li>
              <li>Create and manage your account</li>
              <li>Process transactions and send related information</li>
              <li>Send notifications, updates, and promotional communications</li>
              <li>Respond to your comments, questions, and requests</li>
              <li>Monitor and analyze trends, usage, and activities</li>
              <li>Detect, investigate, and prevent fraudulent or illegal activities</li>
              <li>Personalize and improve your experience</li>
              <li>Comply with legal obligations</li>
            </ul>
          </div>
        </Card>

        <Card title="Information Sharing">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>We may share your information in the following circumstances:</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li><strong className="text-[color:var(--foreground)]">With Other Users:</strong> Your profile information and content you post may be visible to other users</li>
              <li><strong className="text-[color:var(--foreground)]">Service Providers:</strong> Third parties who perform services on our behalf (hosting, analytics, payment processing)</li>
              <li><strong className="text-[color:var(--foreground)]">Legal Requirements:</strong> When required by law or to protect our rights</li>
              <li><strong className="text-[color:var(--foreground)]">Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
              <li><strong className="text-[color:var(--foreground)]">With Your Consent:</strong> When you have given us permission</li>
            </ul>
            <p className="pt-2">
              We do not sell your personal information to third parties.
            </p>
          </div>
        </Card>

        <Card title="Data Security">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              We implement appropriate technical and organizational measures to protect your personal 
              information against unauthorized access, alteration, disclosure, or destruction. However, 
              no method of transmission over the Internet or electronic storage is 100% secure.
            </p>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials and 
              for any activities that occur under your account.
            </p>
          </div>
        </Card>

        <Card title="Data Retention">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              We retain your personal information for as long as your account is active or as needed 
              to provide you services. We may retain certain information as required by law or for 
              legitimate business purposes.
            </p>
            <p>
              You may request deletion of your account and associated data by contacting us at 
              support@cannafamapp.com.
            </p>
          </div>
        </Card>

        <Card title="Your Rights and Choices">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>Depending on your location, you may have the following rights:</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li><strong className="text-[color:var(--foreground)]">Access:</strong> Request a copy of your personal information</li>
              <li><strong className="text-[color:var(--foreground)]">Correction:</strong> Request correction of inaccurate information</li>
              <li><strong className="text-[color:var(--foreground)]">Deletion:</strong> Request deletion of your personal information</li>
              <li><strong className="text-[color:var(--foreground)]">Portability:</strong> Request a copy of your data in a portable format</li>
              <li><strong className="text-[color:var(--foreground)]">Opt-out:</strong> Opt out of promotional communications</li>
            </ul>
            <p className="pt-2">
              To exercise these rights, please contact us at support@cannafamapp.com.
            </p>
          </div>
        </Card>

        <Card title="Cookies and Tracking">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              We use cookies and similar tracking technologies to collect information about your 
              browsing activities. You can control cookies through your browser settings, but 
              disabling cookies may affect the functionality of the Service.
            </p>
          </div>
        </Card>

        <Card title="Third-Party Services">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              The Service may contain links to third-party websites or services. We are not responsible 
              for the privacy practices of these third parties. We encourage you to review their 
              privacy policies.
            </p>
            <p>We use the following third-party services:</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Supabase (authentication and database)</li>
              <li>Stripe (payment processing)</li>
              <li>Agora (live streaming)</li>
            </ul>
          </div>
        </Card>

        <Card title="Children's Privacy">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              The Service is not intended for individuals under 21 years of age. We do not knowingly 
              collect personal information from anyone under 21. If we learn that we have collected 
              personal information from someone under 21, we will delete that information immediately.
            </p>
          </div>
        </Card>

        <Card title="International Data Transfers">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              Your information may be transferred to and processed in countries other than your own. 
              These countries may have different data protection laws. By using the Service, you 
              consent to such transfers.
            </p>
          </div>
        </Card>

        <Card title="California Privacy Rights">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              California residents have additional rights under the California Consumer Privacy Act (CCPA), 
              including the right to know what personal information is collected, the right to delete 
              personal information, and the right to opt-out of the sale of personal information.
            </p>
            <p>
              We do not sell personal information. To exercise your CCPA rights, contact us at 
              support@cannafamapp.com.
            </p>
          </div>
        </Card>

        <Card title="Changes to This Policy">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any changes 
              by posting the new Privacy Policy on this page and updating the "Last updated" date. 
              Your continued use of the Service after any changes constitutes acceptance of the new policy.
            </p>
          </div>
        </Card>

        <Card title="Contact Us">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              If you have any questions about this Privacy Policy, please contact us at:
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
