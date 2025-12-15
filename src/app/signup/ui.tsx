"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { signUpWithPassword, resendSignupVerification } from "@/app/login/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

export function SignupForm() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<null | { ok: boolean; message?: string }>(null);
  const [email, setEmail] = useState<string>("");
  const [favoritedUsername, setFavoritedUsername] = useState<string>("");

  return (
    <form
      className="space-y-4"
      action={(fd) => {
        setResult(null);
        startTransition(async () => {
          const res = await signUpWithPassword(fd);
          if (res.ok) {
            setResult({
              ok: true,
              message:
                "Account created. Check your email to verify (it may be in spam), then come back and sign in.",
            });
          } else {
            setResult({ ok: false, message: res.message });
          }
        });
      }}
    >
      {result?.ok ? (
        <Notice tone="success">{result.message}</Notice>
      ) : null}
      {result && !result.ok ? (
        <Notice tone="error">{result.message}</Notice>
      ) : null}

      <Input
        label="Email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <Input
        label="Favorited username"
        name="favorited_username"
        type="text"
        required
        autoComplete="username"
        placeholder="Your exact Favorited username"
        value={favoritedUsername}
        onChange={(e) => setFavoritedUsername(e.target.value)}
      />

      <Input
        label="Password"
        name="password"
        type="password"
        required
        autoComplete="new-password"
        placeholder="••••••••"
      />

      <Button type="submit" disabled={pending}>
        {pending ? "Creating..." : "Create account"}
      </Button>

      <div className="rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-xs text-[color:var(--muted)]">
        Didn’t get the verification email? Check spam/junk, then you can resend it below.
      </div>

      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          setResult(null);
          startTransition(async () => {
            const cleaned = String(email ?? "").trim();
            const resendFd = new FormData();
            resendFd.set("email", cleaned);
            const res = await resendSignupVerification(resendFd);
            if (res.ok) {
              setResult({ ok: true, message: "Verification email sent. Check your inbox (and spam)." });
            } else {
              setResult({ ok: false, message: res.message });
            }
          });
        }}
      >
        Resend verification email
      </Button>

      <div className="text-xs text-[color:var(--muted)]">
        Already have an account?{" "}
        <Link href="/login" className="underline underline-offset-4">
          Sign in
        </Link>
      </div>
    </form>
  );
}
