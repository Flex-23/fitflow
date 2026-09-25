import type { CurrentUser } from "@/lib/auth/dal";
import { hasSection } from "@/lib/auth/rbac";

/**
 * Who may work on the video library.
 *
 * The library is a section like any other now, so this asks the one question
 * the rest of the app asks. It used to name the roles itself — which meant a
 * master was refused the library it owns, and a manager kept it after the
 * master took it away.
 */
export function canManageVideos(user: CurrentUser | null): boolean {
  return !!user && hasSection(user, "LIBRARY");
}
