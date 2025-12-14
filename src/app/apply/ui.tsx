"use client";

import { useState, useTransition } from "react";
import { submitApplication } from "@/app/apply/actions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

export function ApplyForm({
  authedEmail = null,
}: {
  authedEmail?: string | null;
}) {
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
          const res = await submitApplication(fd);
          if (res.ok) {
            setResult({ ok: true });
          } else {
            setResult({ ok: false, message: res.message });
          }
        });
      }}
    >
      {result?.ok ? (
        <Notice tone="success">
          Application submitted. Once approved, your account will be activated automatically.
        </Notice>
      ) : null}
      {result && !result.ok ? (
        <Notice tone="error">{result.message}</Notice>
      ) : null}

      <Input
        label="Favorited username"
        name="favorited_username"
        required
        autoComplete="off"
        placeholder="Your exact Favorited username"
      />

      <Input
        label={authedEmail ? "Account email" : "Email"}
        name="email"
        type="email"
        autoComplete="email"
        placeholder={authedEmail ? "" : "Use the same email you signed up with"}
        defaultValue={authedEmail ?? ""}
        readOnly={!!authedEmail}
      />

      <Textarea
        label="Short bio (optional)"
        name="short_bio"
        placeholder="What you want people to know about you"
      />

      <label className="block">
        <div className="text-sm font-semibold">Photo (optional)</div>
        <div className="mt-1 text-xs text-[color:var(--muted)]">
          Uploaded images are used on the public roster.
        </div>
        <input
          className="mt-2 block w-full text-sm text-[color:var(--muted)] file:mr-4 file:rounded-lg file:border-0 file:bg-[rgba(25,192,96,0.14)] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[color:var(--foreground)]"
          type="file"
          name="photo"
          accept="image/*"
        />
      </label>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="wants_banner"
          className="mt-1 h-4 w-4 rounded border-[color:var(--border)] bg-[color:var(--card)]"
        />
        <div>
          <div className="text-sm font-semibold">I want a CFM banner</div>
          <div className="text-xs text-[color:var(--muted)]">
            Optional request (no guarantees).
          </div>
        </div>
      </label>

      <Button type="submit" disabled={pending}>
        {pending ? "Submitting..." : "Submit application"}
      </Button>
    </form>
  );
}
