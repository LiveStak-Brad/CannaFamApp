"use client";

import Script from "next/script";
import { useEffect } from "react";

let didInit = false;

declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: any) => void>;
    __cfmOneSignalInitPromise?: Promise<void>;
  }
}

export function OneSignalWebInit({ appId }: { appId: string }) {
  useEffect(() => {
    const id = String(appId ?? "").trim();
    if (!id) {
      try {
        console.error("[OneSignal] missing appId");
      } catch {
      }
      return;
    }

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal: any) {
      if (didInit) return;
      didInit = true;

      try {
        console.log("[OneSignal] init appId", id);
      } catch {
      }

      try {
        OneSignal.setConsentRequired(true);
        OneSignal.setConsentGiven(false);
      } catch {
      }

      window.__cfmOneSignalInitPromise = (async () => {
        await OneSignal.init({
          appId: id,
          notifyButton: { enable: false },
          serviceWorkerPath: "/OneSignalSDKWorker.js",
          serviceWorkerUpdaterPath: "/OneSignalSDKUpdaterWorker.js",
          serviceWorkerParam: { scope: "/" },
        });
      })().catch((e: any) => {
        didInit = false;
        try {
          console.error("[OneSignal] init failed", e);
        } catch {
        }
      });
    });
  }, [appId]);

  return (
    <>
      <Script
        id="onesignal-deferred-bootstrap"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{
          __html: "window.OneSignalDeferred = window.OneSignalDeferred || [];",
        }}
      />
      <Script
        src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
        strategy="afterInteractive"
        onLoad={() => {
          try {
            console.log("[OneSignal] SDK loaded");
          } catch {
          }
        }}
        onError={() => {
          try {
            console.error("[OneSignal] SDK failed to load");
          } catch {
          }
        }}
      />
    </>
  );
}
