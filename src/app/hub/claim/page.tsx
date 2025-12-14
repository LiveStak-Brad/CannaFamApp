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
          <h1 className="text-xl font-semibold">Claim membership</h1>
          <p className="text-sm text-[color:var(--muted)]">
            If your application was approved, you can link your login to your CFM
            member record.
          </p>
        </div>

        <Card>
          <ClaimForm />
        </Card>
      </div>
    </Container>
  );
}
