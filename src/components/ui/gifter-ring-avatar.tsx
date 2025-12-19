"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { getGifterLevel } from "@/lib/gifterLevel";

export type GifterRingAvatarProps = {
  size?: number;
  imageUrl?: string | null;
  name?: string | null;
  totalUsd?: number | null;
  displayLevel?: number | null;
  ringColor?: string | null;
  isDiamond?: boolean | null;
  showLevelBadge?: boolean;
  showDiamondShimmer?: boolean;
  className?: string;
};

const FALLBACK_AVATAR_SRC = "/no-profile-pic.png";

function InnerGifterRingAvatar({
  size = 40,
  imageUrl,
  name,
  totalUsd,
  displayLevel,
  ringColor,
  isDiamond,
  showLevelBadge = true,
  showDiamondShimmer = false,
  className,
}: GifterRingAvatarProps) {
  const level = useMemo(() => {
    const t = typeof totalUsd === "number" ? totalUsd : null;
    if (t !== null) return getGifterLevel(t);
    return null;
  }, [totalUsd]);

  const finalRingColor = (ringColor ?? level?.ringColor ?? "#2a2a2f").trim();
  const finalDisplayLevel = Math.max(
    1,
    Math.floor(Number(displayLevel ?? level?.displayLevel ?? 1)),
  );
  const finalIsDiamond = !!(isDiamond ?? level?.isDiamond);

  const normalizedImageUrl = String(imageUrl ?? "").trim();
  const [imgSrc, setImgSrc] = useState<string>(
    normalizedImageUrl ? normalizedImageUrl : FALLBACK_AVATAR_SRC,
  );

  useEffect(() => {
    setImgSrc(normalizedImageUrl ? normalizedImageUrl : FALLBACK_AVATAR_SRC);
  }, [normalizedImageUrl]);

  const ringStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderColor: finalRingColor,
    boxShadow:
      finalIsDiamond && showDiamondShimmer
        ? `0 0 0 1px ${finalRingColor}66, 0 0 14px ${finalRingColor}33`
        : undefined,
  };

  const badgeSize = Math.max(16, Math.round(size * 0.36));
  const badgeStyle: React.CSSProperties = {
    minWidth: badgeSize,
    height: badgeSize,
    paddingLeft: Math.max(6, Math.round(badgeSize * 0.25)),
    paddingRight: Math.max(6, Math.round(badgeSize * 0.25)),
    fontSize: Math.max(10, Math.round(badgeSize * 0.5)),
    borderColor: finalRingColor,
  };

  return (
    <div
      className={
        "relative inline-flex shrink-0 items-center justify-center overflow-visible rounded-full border-2 bg-[rgba(255,255,255,0.03)] " +
        (className ?? "")
      }
      style={ringStyle}
      aria-label={
        name
          ? `${name} gifter level ${finalDisplayLevel}`
          : `gifter level ${finalDisplayLevel}`
      }
    >
      <img
        src={imgSrc}
        alt={String(name ?? "Avatar")}
        referrerPolicy="no-referrer"
        className="h-full w-full rounded-full object-cover object-top"
        onError={() => {
          if (imgSrc !== FALLBACK_AVATAR_SRC) setImgSrc(FALLBACK_AVATAR_SRC);
        }}
      />

      {showLevelBadge ? (
        <div
          className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 rounded-full border bg-[rgba(0,0,0,0.70)] text-white leading-none"
          style={badgeStyle}
        >
          <div className="flex h-full items-center justify-center font-semibold tabular-nums">
            {finalDisplayLevel >= 1000 ? "999+" : finalDisplayLevel}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export const GifterRingAvatar = memo(InnerGifterRingAvatar);