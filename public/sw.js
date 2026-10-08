/**
 * FitFlow service worker.
 *
 * Deliberately conservative. Every page in this app is signed-in and
 * changes by the minute — a member's remaining days, today's takings — so
 * nothing that comes out of the database is ever cached. Caching a page
 * would risk showing one member another member's screen after a sign-out,
 * which is worse than showing nothing.
 *
 * What it does give the installed app:
 *   - build assets served from cache, so launching is instant;
 *   - a real page instead of the browser's dinosaur when the phone is
 *     offline or the gym's connection drops.
 *
 * Bump CACHE when the shell changes; older caches are dropped on activate.
 */

const CACHE = "fitflow-v1";

// Small and rarely-changing: worth having before the first offline moment.
const SHELL = [
  "/offline",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/fitflow-logo.jpg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // One missing file must not fail the whole install, so each is added
      // on its own and a failure is ignored.
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Signed video URLs expire; server actions and APIs must always be live.
  if (url.pathname.startsWith("/api/")) return;

  // Build output is content-hashed, so a hit is always the right file.
  const immutable =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/fitflow-logo.jpg";

  if (immutable) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // Pages: always from the network, with the offline page as the fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match("/offline").then((hit) => hit ?? new Response("", { status: 504 }))
      )
    );
  }
});
