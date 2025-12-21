"use client";

import Script from "next/script";
import { useEffect } from "react";

declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: any) => void>;
  }
}

export function OneSignalWebInit({ appId }: { appId: string }) {
  useEffect(() => {
    const id = String(appId ?? "").trim();
    if (!id) return;

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal: any) {
      try {
        OneSignal.setConsentRequired(true);
        OneSignal.setConsentGiven(false);
      } catch {
      }

      try {
        await OneSignal.init({
          appId: id,
          notifyButton: { enable: false },
          serviceWorkerPath: "OneSignalSDKWorker.js",
          serviceWorkerParam: { scope: "/" },
        });
      } catch {
      }
    });
  }, [appId]);

  return (
    <Script
      src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
      strategy="afterInteractive"
    />
  );
}
