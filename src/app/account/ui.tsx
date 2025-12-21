"use client";

import { useEffect, useState, useTransition } from "react";
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
          router.push("/");
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

export function LiveAlertsToggle() {
  const [pending, startTransition] = useTransition();
  const [userId, setUserId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [msg, setMsg] = useState<null | { tone: "success" | "error"; text: string }>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = supabaseBrowser();
        const {
          data: { user },
        } = await sb.auth.getUser();
        const uid = String(user?.id ?? "").trim();
        if (!uid) return;
        if (!cancelled) setUserId(uid);

        const { data, error } = await sb
          .from("cfm_notification_prefs")
          .select("live_alerts_enabled")
          .eq("profile_id", uid)
          .maybeSingle();
        if (cancelled) return;
        if (error) return;
        setEnabled(Boolean((data as any)?.live_alerts_enabled));
      } catch {
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-3">
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={enabled ? "primary" : "secondary"}
          disabled={pending}
          onClick={() => {
            setMsg(null);
            startTransition(async () => {
              const uid = String(userId ?? "").trim();
              if (!uid) {
                setMsg({ tone: "error", text: "Please log in again." });
                return;
              }

              const sb = supabaseBrowser();
              const next = !enabled;

              if (typeof window !== "undefined") {
                const OneSignal = (window as any).OneSignal;
                if (!OneSignal) {
                  setMsg({ tone: "error", text: "Push is still loading. Refresh and try again." });
                  return;
                }

                if (next) {
                  try {
                    OneSignal.setConsentGiven(true);
                  } catch {
                  }
                  try {
                    await OneSignal.login(uid);
                  } catch {
                  }
                  try {
                    await OneSignal.Notifications.requestPermission();
                  } catch {
                  }
                  try {
                    await OneSignal.User.PushSubscription.optIn();
                  } catch {
                  }
                } else {
                  try {
                    await OneSignal.User.PushSubscription.optOut();
                  } catch {
                  }
                  try {
                    OneSignal.setConsentGiven(false);
                  } catch {
                  }
                }
              }

              const { data, error } = await (sb as any).rpc("cfm_upsert_notification_prefs", {
                p_live_alerts_enabled: next,
                p_post_alerts_enabled: false,
              });

              if (error) {
                setMsg({ tone: "error", text: error.message });
                return;
              }

              const ok = Boolean((data as any)?.live_alerts_enabled);
              setEnabled(ok);
              setMsg({
                tone: "success",
                text: ok ? "Live alerts enabled." : "Live alerts disabled.",
              });
            });
          }}
        >
          {enabled ? "Live Alerts: ON" : "Live Alerts: OFF"}
        </Button>
        <div className="text-xs text-[color:var(--muted)]">
          You will only be notified when the owner account goes live.
        </div>
      </div>
    </div>
  );
}
