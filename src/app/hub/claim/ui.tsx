"use client";

import { useState, useTransition } from "react";
import { claimMembership } from "./actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

export function ClaimForm() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<null | { ok: boolean; message?: string }>(
    null,
  );

  return (
    <form
      className="space-y-4"
      action={(fd) => {
        setResult(null);
        startTransition(async () => {
          const res = await claimMembership(fd);
          if (res.ok) setResult({ ok: true });
          else setResult({ ok: false, message: res.message });
        });
      }}
    >
      {result?.ok ? (
        <Notice tone="success">Membership linked. Go back to the hub.</Notice>
      ) : null}
      {result && !result.ok ? (
        <Notice tone="error">{result.message}</Notice>
      ) : null}

      <Input
        label="Favorited username"
        name="favorited_username"
        required
        placeholder="Exact username used on your application"
      />

      <Button type="submit" disabled={pending}>
        {pending ? "Linking..." : "Link membership"}
      </Button>
    </form>
  );
}
