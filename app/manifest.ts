import type { MetadataRoute } from "next";

/**
 * What the browser needs to install FitFlow as an app.
 *
 * `start_url` is "/" for everyone: that route looks at the session cookie and
 * sends staff to their work screen and a member to their own page, so one
 * installed icon serves both without two separate builds.
 *
 * Served from the app itself rather than a static file so it stays in step
 * with the routes it points at.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FitFlow",
    short_name: "FitFlow",
    description: "Gym membership, courses and daily takings.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1a1c22",
    theme_color: "#1a1c22",
    // The app is dark-only, so there is no light variant to declare.
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
