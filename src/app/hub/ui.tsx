"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { checkIn, dailySpin } from "./actions";

export function HubCheckInButton({
  disabled,
  checkedToday,
}: {
  disabled: boolean;
  checkedToday: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<null | { tone: "success" | "error"; text: string }>(null);

  return (
    <div className="space-y-2">
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <Button
        type="button"
        disabled={disabled || pending || checkedToday}
        onClick={() => {
          setMsg(null);
          startTransition(async () => {
            try {
              const res = (await checkIn()) as unknown;
              const message =
                typeof (res as any)?.message === "string"
                  ? String((res as any).message)
                  : checkedToday
                    ? "✅ Already checked in today."
                    : "✅ Check-in logged (+1)";
              setMsg({ tone: "success", text: message });
              router.refresh();
            } catch (e) {
              setMsg({ tone: "error", text: e instanceof Error ? e.message : "Check-in failed" });
            }
          });
        }}
      >
        {checkedToday ? "Checked in" : pending ? "Logging..." : "Daily check-in"}
      </Button>
    </div>
  );
}

export function HubSpinButton({
  disabled,
  spunToday,
}: {
  disabled: boolean;
  spunToday: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<null | { tone: "success" | "error"; text: string }>(null);

  return (
    <div className="space-y-2">
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <Button
        type="button"
        disabled={disabled || pending || spunToday}
        onClick={() => {
          setMsg(null);
          startTransition(async () => {
            try {
              const res = (await dailySpin()) as unknown;
              const message =
                typeof (res as any)?.message === "string"
                  ? String((res as any).message)
                  : spunToday
                    ? "🎡 Already spun today."
                    : "🎡 Spin logged";
              setMsg({ tone: "success", text: message });
              router.refresh();
            } catch (e) {
              setMsg({ tone: "error", text: e instanceof Error ? e.message : "Spin failed" });
            }
          });
        }}
      >
        {spunToday ? "Spun" : pending ? "Spinning..." : "Spin"}
      </Button>
    </div>
  );
}
