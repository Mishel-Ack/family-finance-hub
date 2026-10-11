const CACHE_NAME = "familybudget-shell-v1";
const STATIC_ASSETS = ["/offline.html", "/manifest.webmanifest", "/icons/familybudget.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  if (new URL(request.url).pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match("/offline.html")) || Response.error()),
    );
    return;
  }
  if (STATIC_ASSETS.includes(new URL(request.url).pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
  }
});
