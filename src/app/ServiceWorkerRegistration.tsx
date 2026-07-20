"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }
    let registration: ServiceWorkerRegistration | null = null;
    navigator.serviceWorker
      .register("/sw.js")
      .then((swRegistration) => {
        registration = swRegistration;
        const cacheRuntimeAssets = () => {
          // The first document can load its hashed JS/CSS before the newly
          // registered worker controls the page. Cache those runtime assets
          // explicitly so a subsequent offline navigation can hydrate React,
          // not just render the cached HTML shell.
          const runtimeAssets = [
            ...Array.from(document.scripts, (script) => script.src),
            ...Array.from(
              document.querySelectorAll<HTMLLinkElement>(
                'link[href]',
              ),
              (link) => link.href,
            ),
            ...performance
              .getEntriesByType("resource")
              .map((entry) => entry.name),
          ];
          void navigator.serviceWorker.ready.then((readyRegistration) => {
            readyRegistration.active?.postMessage({
              type: "CACHE_URLS",
              urls: ["/", ...runtimeAssets],
            });
          });
        };
        if (document.readyState === "complete") {
          cacheRuntimeAssets();
        } else {
          window.addEventListener("load", cacheRuntimeAssets, { once: true });
        }
      })
      .catch(() => {
        // The player remains usable when service workers are unavailable.
      });

    // Pick up a fresh service worker when the user returns to the tab.
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void registration?.update().catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  return null;
}
