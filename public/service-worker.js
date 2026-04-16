const APP_SHELL_CACHE = "lifting3-shell-v1";
const APP_SHELL_ASSETS = [
  "/offline",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/logo.svg",
  "/logo-maskable.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-192.png",
  "/icon-maskable-512.png",
  "/pwa-screenshot-home.png",
  "/pwa-screenshot-logging.png",
];

function isCacheableSameOriginAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/assets/") || APP_SHELL_ASSETS.includes(url.pathname))
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== APP_SHELL_CACHE)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () => {
        return (await caches.match("/offline")) ?? Response.error();
      }),
    );

    return;
  }

  if (!isCacheableSameOriginAsset(requestUrl)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(async (cachedResponse) => {
      const cache = await caches.open(APP_SHELL_CACHE);
      const networkResponsePromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse.ok) {
            void cache.put(event.request, networkResponse.clone());
          }

          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse ?? networkResponsePromise;
    }),
  );
});
