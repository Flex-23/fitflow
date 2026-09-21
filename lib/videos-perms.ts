import type { CurrentUser } from "@/lib/auth/dal";

/** Manager always; captains only when granted the permission. */
export function canManageVideos(user: CurrentUser | null): boolean {
  return (
    !!user &&
    (user.role === "MANAGER" || (user.role === "CAPTAIN" && user.canAddVideos))
  );
}
