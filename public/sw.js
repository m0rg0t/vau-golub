const CACHE_PREFIX = "zavtracast-sdvg-";
const CACHE_NAME = `${CACHE_PREFIX}v3`;
const SHELL_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/art/pigeon-radio.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
];

async function cacheDataset(cache) {
  try {
    const response = await fetch("/data/catalog.json", { cache: "no-store" });
    if (!response.ok) return;
    const catalog = await response.clone().json();
    const episodeData = Array.isArray(catalog.episodes)
      ? catalog.episodes.flatMap((episode) => [
          episode.dataPath,
          episode.dataPath.replace(/\.json$/, ".vtt"),
          episode.localCoverPath,
        ])
      : [];
    await cache.put("/data/catalog.json", response);
    await cache.addAll(episodeData);
  } catch {
    // The shell remains installable while build-time data is unavailable.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(SHELL_ASSETS);
        await cacheDataset(cache);
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.flatMap((key) =>
            key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME
              ? [caches.delete(key)]
              : [],
          ),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_URLS" || !Array.isArray(event.data.urls)) {
    return;
  }
  const urls = event.data.urls.flatMap((value) => {
    if (typeof value !== "string") return [];
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin &&
      !url.pathname.toLowerCase().endsWith(".mp3")
      ? [value]
      : [];
  });
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        [...new Set(urls)].map(async (url) => {
          const response = await fetch(url);
          if (response.ok) {
            await cache.put(url, response);
          }
        }),
      ),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isAudio =
    request.destination === "audio" ||
    url.pathname.toLowerCase().endsWith(".mp3");
  if (isAudio || url.origin !== self.location.origin) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
