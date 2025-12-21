"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  sendMagicLink,
  sendPasswordReset,
  signInWithPassword,
} from "@/app/login/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import Link from "next/link";

export function LoginForm() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [result, setResult] = useState<null | { ok: boolean; message?: string }>(
    null,
  );

  const callbackMessage = (() => {
    const m = String(searchParams.get("message") ?? "").trim();
    if (m) return m;
    const e = String(searchParams.get("error") ?? "").trim();
    if (e) return "Verification link is invalid or expired. Please use magic link or go to Sign up to resend the verification email.";
    return "";
  })();

  const errorText =
    result && !result.ok
      ? (typeof result.message === "string" && result.message.trim()
          ? result.message
          : "Something went wrong sending the email. Check SMTP settings.")
      : "";

  return (
    <form
      className="space-y-4"
      action={(fd) => {
        setResult(null);
        startTransition(async () => {
          const res =
            mode === "magic"
              ? await sendMagicLink(fd)
              : await signInWithPassword(fd);

          if (res.ok) {
            setResult({
              ok: true,
              message:
                mode === "magic"
                  ? "Check your email for the sign-in link (it may be in spam)."
                  : "Signed in.",
            });
            if (mode === "password") {
              router.push("/");
              router.refresh();
            }
          } else {
            setResult({ ok: false, message: res.message });
          }
        });
      }}
    >
      {callbackMessage ? <Notice tone="error">{callbackMessage}</Notice> : null}
      {result?.ok ? (
        <Notice tone="success">
          {typeof result.message === "string" && result.message.trim()
            ? result.message
            : mode === "magic"
              ? "Check your email for the sign-in link."
              : "Signed in."}
        </Notice>
      ) : null}
      {result && !result.ok ? <Notice tone="error">{errorText}</Notice> : null}

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant={mode === "password" ? "primary" : "secondary"}
          disabled={pending}
          onClick={() => {
            setResult(null);
            setMode("password");
          }}
        >
          Password
        </Button>
        <Button
          type="button"
          variant={mode === "magic" ? "primary" : "secondary"}
          disabled={pending}
          onClick={() => {
            setResult(null);
            setMode("magic");
          }}
        >
          Magic link
        </Button>
      </div>

      <Input
        label="Email or username"
        name="identifier"
        type="text"
        required
        autoComplete="username"
        placeholder="you@example.com or username"
      />

      {mode === "password" ? (
        <Input
          label="Password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
        />
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending
          ? "Working..."
          : mode === "magic"
            ? "Send magic link"
            : "Sign in"}
      </Button>

      <div className="text-xs text-[color:var(--muted)]">
        New here?{" "}
        <Link href="/signup" className="underline underline-offset-4">
          Create an account
        </Link>
      </div>

      {mode === "password" ? (
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            setResult(null);
            startTransition(async () => {
              const identEl = document.querySelector<HTMLInputElement>("input[name='identifier']");
              const email = String(identEl?.value ?? "").trim();
              if (!email.includes("@")) {
                setResult({ ok: false, message: "Password reset requires an email address." });
                return;
              }
              const fd = new FormData();
              fd.set("email", email);
              const res = await sendPasswordReset(fd);
              if (res.ok) {
                setResult({ ok: true });
              } else {
                setResult({ ok: false, message: res.message });
              }
            });
          }}
        >
          Send password reset email
        </Button>
      ) : null}
    </form>
  );
}
