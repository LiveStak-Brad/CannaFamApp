import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import Image from "next/image";
import { SignupForm } from "./ui";

export const runtime = "nodejs";

export default function SignupPage() {
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
          <h1 className="text-xl font-semibold">✨ Create account</h1>
          <p className="text-sm text-[color:var(--muted)]">
            Email, username, and password. You’ll need to verify your email (check spam).
          </p>
        </div>

        <Card>
          <SignupForm />
        </Card>
      </div>
    </Container>
  );
}
