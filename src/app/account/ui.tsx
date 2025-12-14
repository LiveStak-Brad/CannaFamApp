"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

export function AccountPasswordForm() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [result, setResult] = useState<null | { tone: "success" | "error"; text: string }>(
    null,
  );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setResult(null);

        const formEl = e.currentTarget;

        const fd = new FormData(e.currentTarget);
        const password = String(fd.get("password") ?? "");
        const confirm = String(fd.get("confirm") ?? "");

        if (!password) {
          setResult({ tone: "error", text: "Password is required." });
          return;
        }
        if (password.length < 8) {
          setResult({ tone: "error", text: "Password must be at least 8 characters." });
          return;
        }
        if (password !== confirm) {
          setResult({ tone: "error", text: "Passwords do not match." });
          return;
        }

        startTransition(async () => {
          const sb = supabaseBrowser();
          const { error } = await sb.auth.updateUser({ password });

          if (error) {
            setResult({ tone: "error", text: error.message });
            return;
          }

          formEl.reset();
          router.push("/hub");
          router.refresh();
        });
      }}
    >
      {result ? <Notice tone={result.tone}>{result.text}</Notice> : null}

      <Input
        label="New password"
        name="password"
        type="password"
        required
        autoComplete="new-password"
      />
      <Input
        label="Confirm new password"
        name="confirm"
        type="password"
        required
        autoComplete="new-password"
      />

      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Update password"}
      </Button>

      <div className="text-xs text-[color:var(--muted)]">
        Tip: accounts created with magic links can set a password here after logging in once.
      </div>
    </form>
  );
}
