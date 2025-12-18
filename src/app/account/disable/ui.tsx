"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

export function DisableAccountForm() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [result, setResult] = useState<null | { tone: "success" | "error"; text: string }>(null);
  const [confirmText, setConfirmText] = useState("");

  const isConfirmed = confirmText.toLowerCase() === "disable my account";

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setResult(null);

        if (!isConfirmed) {
          setResult({ tone: "error", text: "Please type 'DISABLE MY ACCOUNT' to confirm." });
          return;
        }

        startTransition(async () => {
          try {
            const sb = supabaseBrowser();
            
            const { data: { user } } = await sb.auth.getUser();
            if (!user) {
              setResult({ tone: "error", text: "You must be logged in to disable your account." });
              return;
            }

            const { error } = await sb.rpc("cfm_disable_my_account");

            if (error) {
              setResult({ tone: "error", text: error.message });
              return;
            }

            await sb.auth.signOut();
            router.push("/");
            router.refresh();
          } catch (err) {
            setResult({ tone: "error", text: err instanceof Error ? err.message : "An error occurred" });
          }
        });
      }}
    >
      {result ? <Notice tone={result.tone}>{result.text}</Notice> : null}

      <div className="space-y-2">
        <label className="block text-sm font-medium text-[color:var(--foreground)]">
          Type <span className="font-bold text-red-400">DISABLE MY ACCOUNT</span> to confirm:
        </label>
        <Input
          label=""
          name="confirm"
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="DISABLE MY ACCOUNT"
          autoComplete="off"
        />
      </div>

      <div className="flex gap-3">
        <Link
          href="/account"
          className="inline-flex items-center justify-center rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-2 text-sm font-medium text-[color:var(--foreground)] hover:bg-[color:var(--border)] transition"
        >
          Cancel
        </Link>
        <Button
          type="submit"
          disabled={pending || !isConfirmed}
          className="bg-red-500 hover:bg-red-600 text-white disabled:opacity-50"
        >
          {pending ? "Disabling..." : "Disable My Account"}
        </Button>
      </div>
    </form>
  );
}
