import type { MetadataRoute } from "next";
import { memberManifest } from "@/lib/pwa";

/**
 * The member's app — the default for every page that is not staff-only.
 *
 * Served from the app rather than a static file so it stays in step with the
 * routes it points at. The staff app has its own at /staff.webmanifest.
 */
export default function manifest(): MetadataRoute.Manifest {
  return memberManifest();
}
