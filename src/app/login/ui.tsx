"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  sendMagicLink,
  sendPasswordReset,
  resendSignupVerification,
  signInWithPassword,
  signUpWithPassword,
} from "@/app/login/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

export function LoginForm() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [intent, setIntent] = useState<"signin" | "signup">("signin");
  const formRef = useRef<HTMLFormElement | null>(null);
  const [result, setResult] = useState<null | { ok: boolean; message?: string }>(
    null,
  );

  const errorText =
    result && !result.ok
      ? (typeof result.message === "string" && result.message.trim()
          ? result.message
          : "Something went wrong sending the email. Check SMTP settings.")
      : "";

  return (
    <form
      className="space-y-4"
      ref={formRef}
      action={(fd) => {
        setResult(null);
        startTransition(async () => {
          const res =
            mode === "magic"
              ? await sendMagicLink(fd)
              : intent === "signup"
                ? await signUpWithPassword(fd)
                : await signInWithPassword(fd);

          if (res.ok) {
            setResult({ ok: true });
            if (mode === "password") {
              router.push(intent === "signup" ? "/apply" : "/hub");
              router.refresh();
            }
          } else {
            setResult({ ok: false, message: res.message });
          }
        });
      }}
    >
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
        label="Email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
      />

      {mode === "password" ? (
        <Input
          label="Password"
          name="password"
          type="password"
          required
          autoComplete={intent === "signup" ? "new-password" : "current-password"}
          placeholder="••••••••"
        />
      ) : null}

      {mode === "password" ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={intent === "signin" ? "primary" : "secondary"}
            disabled={pending}
            onClick={() => {
              setResult(null);
              setIntent("signin");
            }}
          >
            Sign in
          </Button>
          <Button
            type="button"
            variant={intent === "signup" ? "primary" : "secondary"}
            disabled={pending}
            onClick={() => {
              setResult(null);
              setIntent("signup");
            }}
          >
            Sign up
          </Button>
        </div>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending
          ? "Working..."
          : mode === "magic"
            ? "Send magic link"
            : intent === "signup"
              ? "Create account"
              : "Sign in"}
      </Button>

      {mode === "password" ? (
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            setResult(null);
            startTransition(async () => {
              const formEl = formRef.current;
              if (!formEl) {
                setResult({ ok: false, message: "Form not ready. Please try again." });
                return;
              }
              const fd = new FormData(formEl);
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

      {mode === "password" ? (
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            setResult(null);
            startTransition(async () => {
              const formEl = formRef.current;
              if (!formEl) {
                setResult({ ok: false, message: "Form not ready. Please try again." });
                return;
              }
              const fd = new FormData(formEl);
              const res = await resendSignupVerification(fd);
              if (res.ok) {
                setResult({ ok: true, message: "Verification email sent. Check your inbox." });
              } else {
                setResult({ ok: false, message: res.message });
              }
            });
          }}
        >
          Resend verification email
        </Button>
      ) : null}
    </form>
  );
}
