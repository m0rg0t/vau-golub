"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then((registration) => {
          const urls = performance
            .getEntriesByType("resource")
            .map((entry) => entry.name)
            .filter((value) => new URL(value).origin === window.location.origin);
          registration.active?.postMessage({ type: "CACHE_URLS", urls });
        })
        .catch(() => {
          // The player remains usable when service workers are unavailable.
        });
    }
  }, []);

  return null;
}
