"use client";

import { memo } from "react";

export type RoleType = "owner" | "admin" | "moderator" | null;

type RoleBadgeProps = {
  role: RoleType;
  size?: "sm" | "md";
};

function InnerRoleBadge({ role, size = "sm" }: RoleBadgeProps) {
  if (!role) return null;

  const badge = role === "owner" ? "👑" : role === "admin" ? "🛡️" : role === "moderator" ? "🚨" : null;
  if (!badge) return null;

  const sizeClass = size === "md" ? "text-sm" : "text-xs";

  return (
    <span className={sizeClass} title={role.charAt(0).toUpperCase() + role.slice(1)}>
      {badge}
    </span>
  );
}

export const RoleBadge = memo(InnerRoleBadge);
