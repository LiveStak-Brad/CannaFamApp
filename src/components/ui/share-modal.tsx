"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function safeEncodeURIComponent(input: string) {
  try {
    return encodeURIComponent(input);
  } catch {
    return encodeURIComponent(String(input).replace(/[\uD800-\uDFFF]/g, "\uFFFD"));
  }
}

function buildFacebookShareUrl(url: string) {
  return `https://www.facebook.com/sharer/sharer.php?u=${safeEncodeURIComponent(url)}`;
}

function buildXShareUrl(url: string, text?: string) {
  const params = new URLSearchParams();
  params.set("url", url);
  if (text) params.set("text", text);
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

function buildRedditShareUrl(url: string, title?: string) {
  const params = new URLSearchParams();
  params.set("url", url);
  if (title) params.set("title", title);
  return `https://www.reddit.com/submit?${params.toString()}`;
}

function buildMessengerShareUrl(url: string) {
  // Works on some mobile devices; desktop fallback will just do nothing.
  return `fb-messenger://share?link=${safeEncodeURIComponent(url)}`;
}

function buildSmsShareUrl(message: string) {
  return `sms:?&body=${safeEncodeURIComponent(message)}`;
}

export function ShareModal({
  open,
  title,
  link,
  message,
  confirmLabel = "I shared it",
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  link: string;
  message: string;
  confirmLabel?: string;
  pending?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const [toast, setToast] = useState<string | null>(null);
  const [sharedAttempted, setSharedAttempted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setToast(null);
    setSharedAttempted(false);
  }, [open]);

  const smsUrl = open ? buildSmsShareUrl(message) : "";

  const shareNow = async () => {
    try {
      const nav = (globalThis as any).navigator as any | undefined;
      if (nav?.share) {
        await nav.share({
          title: "CannaStreams Live",
          text: message,
          url: link,
        });
        setSharedAttempted(true);
        setToast("Shared via device share sheet.");
        return;
      }

      if (!nav?.clipboard?.writeText) {
        throw new Error("Clipboard not available in this browser.");
      }
      await nav.clipboard.writeText(`${message}\n\n${link}`.trim());
      setSharedAttempted(true);
      setToast("Copied. Paste into Instagram story or DM / text / anywhere.");
    } catch (e) {
      setSharedAttempted(true);
      setToast(e instanceof Error ? e.message : "Share failed");
    }
  };

  const openInNewTab = (url: string) => {
    try {
      window.open(url, "_blank", "noreferrer");
    } catch {
      // ignore
    }
  };

  const copyText = async (text: string, toastText: string) => {
    const nav = (globalThis as any).navigator as any | undefined;
    if (!nav?.clipboard?.writeText) throw new Error("Clipboard not available in this browser.");
    await nav.clipboard.writeText(text);
    setSharedAttempted(true);
    setToast(toastText);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close share dialog"
        onClick={onClose}
      />

      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-xl px-4 pb-4">
        <Card title={title}>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-[color:var(--muted)]">Share link</div>
              <div className="rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-xs break-all">
                {link}
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={async () => {
                  await copyText(link, "Copied. Paste into Instagram story or DM / text / anywhere.");
                }}
              >
                Copy link
              </Button>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-[color:var(--muted)]">Share message</div>
              <textarea
                readOnly
                value={message}
                className="w-full min-h-24 rounded-xl bg-[color:var(--card)] px-3 py-2 text-xs text-[color:var(--foreground)] outline-none ring-1 ring-[color:var(--border)]"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={async () => {
                  await copyText(message, "Copied. Paste into Instagram story or DM / text / anywhere.");
                }}
              >
                Copy message
              </Button>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-[color:var(--muted)]">Share now</div>
              <Button type="button" onClick={shareNow} disabled={pending}>
                Share
              </Button>
              <div className="text-xs text-[color:var(--muted)]">
                Uses your phone share sheet when available. Otherwise copies text for you.
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-[color:var(--muted)]">Quick share</div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={async () => {
                    await copyText(message, "Copied. Opening SMS (best on mobile). Paste if needed, then confirm.");
                    openInNewTab(smsUrl);
                  }}
                >
                  Text Message (SMS)
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={async () => {
                    await copyText(message, "Copied. Opening Facebook share. Paste if needed, then confirm.");
                    openInNewTab(buildFacebookShareUrl(link));
                  }}
                >
                  Facebook
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={async () => {
                    await copyText(message, "Copied. Open Instagram and paste into a Story or DM, then confirm.");
                    openInNewTab("https://www.instagram.com/");
                  }}
                >
                  Instagram
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={async () => {
                    await copyText(message, "Copied. Opening Messenger. Paste if needed, then confirm.");
                    openInNewTab(buildMessengerShareUrl(link));
                  }}
                >
                  Messenger
                </Button>
              </div>
              <div className="text-xs text-[color:var(--muted)]">
                Share anywhere you want. Then come back and tap <span className="font-semibold">{confirmLabel}</span>.
              </div>
              <div className="text-xs text-[color:var(--muted)]">
                Text (SMS) works best on mobile.
              </div>
              <div className="text-xs text-[color:var(--muted)]">
                Instagram web can’t auto-post to Story. Copy message, then paste into Story manually.
              </div>
              {toast ? <div className="text-xs text-[color:var(--foreground)]">{toast}</div> : null}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
                Close
              </Button>
              <Button type="button" onClick={onConfirm} disabled={pending || !sharedAttempted}>
                {pending ? "Logging..." : confirmLabel}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
