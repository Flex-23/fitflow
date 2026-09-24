import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/app-url";

/**
 * FitFlow installs as two apps, not one.
 *
 * A member's icon opens their own page; the manager's opens the day's
 * summary. They share an origin, so the browser tells them apart by `id` —
 * without it, installing one would replace the other. They look different
 * too: the member's is the mark on the app's near-black, the manager's the
 * same mark framed in brand green, which is what a person actually reads on
 * a crowded home screen.
 */

export const MEMBER_MANIFEST = "/manifest.webmanifest";
export const STAFF_MANIFEST = "/staff.webmanifest";

const BACKGROUND = "#1a1c22";

/**
 * Declaring our own manifest as a related application is what lets a page ask
 * `navigator.getInstalledRelatedApps()` whether this app is already on the
 * phone — the only reliable way to know from inside a normal browser tab.
 */
function selfReference(manifestPath: string) {
  return [{ platform: "webapp", url: `${appUrl()}${manifestPath}` }];
}

export function memberManifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "FitFlow",
    short_name: "FitFlow",
    description: "Your membership, your subscription and your courses.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: BACKGROUND,
    theme_color: BACKGROUND,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    related_applications: selfReference(MEMBER_MANIFEST),
    prefer_related_applications: false,
  };
}

export function staffManifest(): MetadataRoute.Manifest {
  return {
    id: "/staff",
    name: "FitFlow Staff",
    short_name: "FitFlow Staff",
    description: "The gym's day: takings, members and what needs attention.",
    // Not "/" — a second app needs a start URL of its own, and this one
    // sends every role to its own screen anyway.
    start_url: "/summary",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: BACKGROUND,
    theme_color: BACKGROUND,
    icons: [
      { src: "/icons/staff-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/staff-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/staff-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/staff-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    related_applications: selfReference(STAFF_MANIFEST),
    prefer_related_applications: false,
  };
}
