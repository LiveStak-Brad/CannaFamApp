import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";

export const runtime = "nodejs";

export const metadata = {
  title: "Terms of Service | CannaFam",
  description: "Terms of Service for CannaFam",
};

export default function TermsPage() {
  return (
    <Container>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">📜 Terms of Service</h1>
          <p className="text-sm text-[color:var(--muted)]">
            Last updated: December 17, 2024
          </p>
        </div>

        <Card title="1. Acceptance of Terms">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              By accessing or using CannaFam ("the Service"), including our website and mobile applications, 
              you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, 
              please do not use the Service.
            </p>
            <p>
              We reserve the right to modify these Terms at any time. Your continued use of the Service 
              after any changes constitutes acceptance of the new Terms.
            </p>
          </div>
        </Card>

        <Card title="2. Eligibility">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              You must be at least 21 years of age to use this Service. By using the Service, you represent 
              and warrant that you are at least 21 years old and have the legal capacity to enter into 
              these Terms.
            </p>
            <p>
              The Service is intended for use only in jurisdictions where such use is legal. You are 
              responsible for ensuring that your use of the Service complies with all applicable local, 
              state, and federal laws.
            </p>
          </div>
        </Card>

        <Card title="3. Account Registration">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              To access certain features of the Service, you may need to create an account. You agree to:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Provide accurate, current, and complete information</li>
              <li>Maintain and promptly update your account information</li>
              <li>Keep your password secure and confidential</li>
              <li>Accept responsibility for all activities under your account</li>
              <li>Notify us immediately of any unauthorized use</li>
            </ul>
          </div>
        </Card>

        <Card title="4. User Conduct">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>You agree not to:</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Violate any applicable laws or regulations</li>
              <li>Post illegal, harmful, threatening, abusive, or defamatory content</li>
              <li>Harass, bully, or intimidate other users</li>
              <li>Impersonate any person or entity</li>
              <li>Spam, advertise, or solicit without permission</li>
              <li>Upload viruses or malicious code</li>
              <li>Attempt to gain unauthorized access to the Service</li>
              <li>Interfere with or disrupt the Service</li>
              <li>Collect user information without consent</li>
              <li>Use the Service for any illegal purpose</li>
            </ul>
          </div>
        </Card>

        <Card title="5. Content">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              <strong className="text-[color:var(--foreground)]">User Content:</strong> You retain ownership of content you post. 
              By posting content, you grant us a non-exclusive, worldwide, royalty-free license to use, 
              display, and distribute your content in connection with the Service.
            </p>
            <p>
              <strong className="text-[color:var(--foreground)]">Content Moderation:</strong> We reserve the right to remove any content 
              that violates these Terms or our Community Guidelines, without prior notice.
            </p>
            <p>
              <strong className="text-[color:var(--foreground)]">Prohibited Content:</strong> Content depicting illegal activities, 
              violence, hate speech, or explicit material involving minors is strictly prohibited and 
              will result in immediate account termination and reporting to authorities.
            </p>
          </div>
        </Card>

        <Card title="6. Live Streaming">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              Live streaming features are subject to additional guidelines:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Streamers must comply with all applicable broadcasting laws</li>
              <li>No streaming of illegal activities</li>
              <li>No harassment or targeting of individuals</li>
              <li>Respect intellectual property rights</li>
              <li>We may terminate streams that violate these Terms</li>
            </ul>
          </div>
        </Card>

        <Card title="7. Virtual Gifts and Payments">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              The Service may offer virtual gifts or payment features. All purchases are final and 
              non-refundable unless required by law. Virtual items have no real-world value and cannot 
              be exchanged for cash.
            </p>
            <p>
              We use third-party payment processors and are not responsible for their actions or policies.
            </p>
          </div>
        </Card>

        <Card title="8. Points and Rewards">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              Points earned through the Service are for engagement purposes only. Points have no monetary 
              value and cannot be redeemed for cash. We reserve the right to modify, suspend, or terminate 
              the points system at any time.
            </p>
          </div>
        </Card>

        <Card title="9. Intellectual Property">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              The Service and its original content, features, and functionality are owned by CannaFam 
              and are protected by international copyright, trademark, and other intellectual property laws.
            </p>
          </div>
        </Card>

        <Card title="10. Disclaimers">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, 
              EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, 
              OR ERROR-FREE.
            </p>
            <p>
              We are not responsible for any user-generated content or the actions of other users.
            </p>
          </div>
        </Card>

        <Card title="11. Limitation of Liability">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, CANNAFAM SHALL NOT BE LIABLE FOR ANY INDIRECT, 
              INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICE.
            </p>
          </div>
        </Card>

        <Card title="12. Indemnification">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              You agree to indemnify and hold harmless CannaFam and its officers, directors, employees, 
              and agents from any claims, damages, or expenses arising from your use of the Service or 
              violation of these Terms.
            </p>
          </div>
        </Card>

        <Card title="13. Termination">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              We may terminate or suspend your account and access to the Service immediately, without 
              prior notice, for any reason, including breach of these Terms. Upon termination, your 
              right to use the Service will cease immediately.
            </p>
          </div>
        </Card>

        <Card title="14. Governing Law">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the 
              United States, without regard to conflict of law principles.
            </p>
          </div>
        </Card>

        <Card title="15. Contact Us">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              If you have any questions about these Terms, please contact us at:
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
