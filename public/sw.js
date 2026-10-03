const CACHE_PREFIX = "zavtracast-sdvg-";
const CACHE_NAME = `${CACHE_PREFIX}v5`;
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
      .then((cache) => Promise.all(SHELL_ASSETS.map(async (url) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Could not cache shell asset: ${url}`);
        if (canCacheResponse(response)) await cache.put(url, response);
      })))
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
          if (canCacheResponse(response)) {
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
    if (canCacheResponse(response)) {
      const copy = response.clone();
      event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.put("/", copy)),
      );
    }
    return response;
  } catch {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match("/");
    return cached && canCacheResponse(cached) ? cached : Response.error();
  }
}

function canCacheResponse(response) {
  const directives = (response.headers.get("cache-control") || "").split(",");
  return response.ok && !directives.some(value => /^(?:private|no-store)(?:\s*=|\s*$)/i.test(value.trim()));
}

async function matchPublicCache(cache, request) {
  const exact = await cache.match(request);
  if (exact) return canCacheResponse(exact) ? exact : undefined;

  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  const publicAsset = /^\/(?:_next\/static\/|data\/|icons\/|art\/|covers\/)/.test(url.pathname)
    || url.pathname === "/manifest.webmanifest";
  if (request.method !== "GET" || url.origin !== self.location.origin || !publicAsset
    || url.pathname.toLowerCase().endsWith(".mp3")
    || (origin && origin !== self.location.origin)) return undefined;

  // Public assets warmed with fetch() have no Origin in their stored key,
  // whereas module/preload requests can carry this same origin. Preserve all
  // other Vary rules, including Cookie, Authorization and framework variants.
  const candidate = await cache.match(request, { ignoreVary: true });
  if (!candidate || !canCacheResponse(candidate)) return undefined;
  const vary = (candidate.headers.get("vary") || "").split(",").map(value => value.trim().toLowerCase());
  const allowedOrigin = candidate.headers.get("access-control-allow-origin");
  return vary.length === 1 && vary[0] === "origin"
    && (!allowedOrigin || allowedOrigin === "*" || allowedOrigin === self.location.origin)
    ? candidate : undefined;
}

// Data JSON stays fresh: serve from cache instantly when available, but always
// revalidate in the background so new episodes appear without a SW bump.
async function handleData(event, request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await matchPublicCache(cache, request);
  const network = fetch(request).then((response) => {
    if (canCacheResponse(response)) {
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
  const cache = await caches.open(CACHE_NAME);
  const cached = await matchPublicCache(cache, request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  if (canCacheResponse(response)) {
    const copy = response.clone();
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
