"use client";

import { useEffect } from "react";

/**
 * Registers the service worker once the page has settled.
 *
 * Registration is deferred to `load` so it never competes with the first
 * render, and failures are swallowed: an unregistered worker costs the
 * offline page and nothing else, so it is not worth an error in the user's
 * face. In development the worker is left off entirely — it would serve
 * stale build assets between recompiles.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    };

    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
