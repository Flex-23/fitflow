import { staffManifest } from "@/lib/pwa";

/**
 * The staff app's manifest.
 *
 * A route handler rather than a second `manifest.ts`, because Next allows
 * only one of those per app. The staff pages point at this one, so installing
 * from there gives the green icon and the summary screen instead of the
 * member's page.
 */
export function GET() {
  return Response.json(staffManifest(), {
    headers: {
      "Content-Type": "application/manifest+json",
      // Short: the icons and name change rarely, but never want pinning.
      "Cache-Control": "public, max-age=300",
    },
  });
}
