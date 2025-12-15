"use client";

import { useState, useTransition } from "react";
import { createMyProfile } from "./actions";
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
          const res = await createMyProfile(fd);
          if (res.ok) setResult({ ok: true });
          else setResult({ ok: false, message: res.message });
        });
      }}
    >
      {result?.ok ? (
        <Notice tone="success">Profile created. Go back to the hub.</Notice>
      ) : null}
      {result && !result.ok ? (
        <Notice tone="error">{result.message}</Notice>
      ) : null}

      <Input
        label="Favorited username"
        name="favorited_username"
        required
        placeholder="Your exact Favorited username"
      />

      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Create profile"}
      </Button>
    </form>
  );
}
