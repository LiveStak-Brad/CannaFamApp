import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import Image from "next/image";
import { LoginForm } from "./ui";

export const runtime = "nodejs";

export default function LoginPage() {
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
          <h1 className="text-xl font-semibold">🔒 Login</h1>
          <p className="text-sm text-[color:var(--muted)]">
            Sign in with password (fast) or use an email magic link.
          </p>
        </div>

        <Card>
          <LoginForm />
        </Card>
      </div>
    </Container>
  );
}
