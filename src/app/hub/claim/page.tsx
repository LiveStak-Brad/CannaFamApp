import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { ClaimForm } from "./ui";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

export default async function ClaimPage() {
  await requireUser();

  return (
    <Container>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Create your profile</h1>
          <p className="text-sm text-[color:var(--muted)]">
            Pick your Favorited username to create your member profile.
          </p>
        </div>

        <Card>
          <ClaimForm />
        </Card>
      </div>
    </Container>
  );
}
