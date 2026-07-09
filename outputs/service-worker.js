"use strict";

const CACHE_PREFIX = "bistropet-pwa";
const CACHE_NAME = `${CACHE_PREFIX}-v13-20260709`;
const APP_SHELL = [
  "/",
  "/index.html",
  "/terms.html",
  "/privacy.html",
  "/session-2-pet-profile.html",
  "/session-3-meal.html",
  "/session-4-weekly-plan.html",
  "/styles.css",
  "/bistropet-supabase.js",
  "/bistropet-storage.js",
  "/bistropet-image-service.js",
  "/bistropet-accessibility.js",
  "/pwa.js",
  "/manifest.json",
  "/icons/bistropet-192.png",
  "/icons/bistropet-512.png",
  "/icons/bistropet-maskable-192.png",
  "/icons/bistropet-maskable-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function canCache(response) {
  return response && response.ok && !/no-store/i.test(response.headers.get("Cache-Control") || "");
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (canCache(response)) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    return (await cache.match(request)) || (request.mode === "navigate" ? cache.match("/index.html") : Promise.reject(error));
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (canCache(response)) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate" || /\.(?:html|css|js|json)$/i.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (/\.(?:png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
