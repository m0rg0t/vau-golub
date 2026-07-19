const CACHE_PREFIX = "zavtracast-sdvg-";
const CACHE_NAME = `${CACHE_PREFIX}v4`;
const SHELL_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/art/pigeon-radio.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
];

// Install stays fast: only the shell is cached here. The app streams the full
// dataset in later via the CACHE_URLS message once the browser is idle.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
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
        ),
      self.registration.navigationPreload
        ? self.registration.navigationPreload.enable()
        : Promise.resolve(),
    ]).then(() => self.clients.claim()),
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
          if (await cache.match(url)) return;
          const response = await fetch(url);
          if (response.ok) {
            await cache.put(url, response);
          }
        }),
      ),
    ),
  );
});

async function handleNavigate(event, request) {
  try {
    const preloaded = await event.preloadResponse;
    const response = preloaded || (await fetch(request));
    const copy = response.clone();
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => cache.put("/", copy)),
    );
    return response;
  } catch {
    const cached = await caches.match("/");
    return cached || Response.error();
  }
}

// Data JSON stays fresh: serve from cache instantly when available, but always
// revalidate in the background so new episodes appear without a SW bump.
async function handleData(event, request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request).then((response) => {
    if (response.ok) {
      void cache.put(request, response.clone());
    }
    return response;
  });
  if (cached) {
    event.waitUntil(network.catch(() => undefined));
    return cached;
  }
  return network;
}

async function handleStatic(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  if (response.ok) {
    const copy = response.clone();
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, copy);
  }
  return response;
}

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
    event.respondWith(handleNavigate(event, request));
    return;
  }

  if (url.pathname.startsWith("/data/")) {
    event.respondWith(handleData(event, request));
    return;
  }

  event.respondWith(handleStatic(request));
});
