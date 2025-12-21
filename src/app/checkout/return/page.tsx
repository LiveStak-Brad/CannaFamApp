"use client";

import { useEffect, useMemo, useState } from "react";

function getParam(search: string, name: string) {
  try {
    const params = new URLSearchParams(search);
    return params.get(name);
  } catch {
    return null;
  }
}

function normalizeTarget(raw: string | null) {
  const t = String(raw ?? "").trim();
  if (!t) return "/";
  if (t.startsWith("/")) return t;
  return `/${t}`;
}

function parseTarget(target: string) {
  const t = String(target ?? "").trim() || "/";
  const idx = t.indexOf("?");
  if (idx === -1) return { path: t, search: "" };
  return { path: t.slice(0, idx) || "/", search: t.slice(idx + 1) || "" };
}

export default function CheckoutReturnPage() {
  const [clicked, setClicked] = useState(false);

  const search = typeof window !== "undefined" ? window.location.search : "";

  const target = useMemo(() => normalizeTarget(getParam(search, "target")), [search]);
  const gift = useMemo(() => getParam(search, "gift"), [search]);
  const giftId = useMemo(() => getParam(search, "gift_id"), [search]);
  const postId = useMemo(() => getParam(search, "post_id"), [search]);

  const deepLink = useMemo(() => {
    const { path, search: targetSearch } = parseTarget(target);
    const deepLinkUrl = new URL(`cannafam://${path.replace(/^\/+/, "")}`);
    if (targetSearch) {
      try {
        const sp = new URLSearchParams(targetSearch);
        sp.forEach((value, key) => {
          deepLinkUrl.searchParams.set(key, value);
        });
      } catch {
      }
    }

    if (gift) deepLinkUrl.searchParams.set("gift", gift);
    if (giftId) deepLinkUrl.searchParams.set("gift_id", giftId);
    if (postId) deepLinkUrl.searchParams.set("post_id", postId);

    return deepLinkUrl.toString();
  }, [gift, giftId, postId, target]);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        window.location.href = deepLink;
      } catch {
      }
    }, 50);

    return () => clearTimeout(t);
  }, [deepLink]);

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Returning to CannaFam…</h1>
      <p style={{ opacity: 0.85, marginBottom: 16 }}>
        If you are not automatically redirected back to the app, tap the button below.
      </p>

      <a
        href={deepLink}
        onClick={() => setClicked(true)}
        style={{
          display: "inline-block",
          padding: "12px 16px",
          borderRadius: 12,
          background: "#16a34a",
          color: "white",
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Open CannaFam App
      </a>

      <div style={{ marginTop: 16, fontSize: 12, opacity: 0.7, wordBreak: "break-all" }}>
        {clicked ? "Trying to open: " : "Deep link: "}{deepLink}
      </div>
    </main>
  );
}
