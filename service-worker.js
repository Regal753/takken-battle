"use strict";

const VERSION = "20260826-quality-v39-4-68744e2bbe74";
const CACHE_NAME = `takken-battle-${VERSION}`;
const IMMUTABLE = [
  "styles.css", "exam-blueprint.js", "exam-question-core.js", "exam-questions-rights.js",
  "exam-questions-restrictions.js", "exam-questions-tax-other.js", "exam-questions-business.js",
  "subject-sprint-bank.js", "business-fullscore-supplement.js", "business-fullscore-bank.js",
  "guarantee-association-drill.js",
  "practical-question-bank.js", "question-bank.js", "question-balance.js", "reward-system.js",
  "official-exam-data.js", "official-law-baseline.js", "official-topic-map.js", "calculation-drill.js",
  "save-store.js", "save-transfer.js", "state-sync.js", "business-mastery.js", "business-knock.js",
  "business-pace.js", "pass-readiness.js", "exam-current-year-2026.js", "pwa-runtime.js", "app.js",
  "manifest.webmanifest", "release-integrity.json", "assets/pwa-icon-192.svg", "assets/pwa-icon-512.svg",
  "assets/battle/grassland-route.webp", "assets/characters/contract-mimic.webp",
  "assets/characters/deadline-warden.webp", "assets/characters/law-citadel-boss.webp",
  "assets/characters/license-sentinel.webp", "assets/characters/notice-gargoyle.webp",
  "assets/characters/registry-sphinx.webp", "assets/characters/study-knight.webp",
  "assets/characters/vault-tortoise.webp"
].map((path) => new URL(`${path}?v=${VERSION}`, self.registration.scope).toString());
const IMMUTABLE_BY_PATH = new Map(IMMUTABLE.map((url) => [new URL(url).pathname, url]));
const SHELL = new URL("./", self.registration.scope).toString();

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll([SHELL, ...IMMUTABLE])));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names
        .filter((name) => name.startsWith("takken-battle-") && name !== CACHE_NAME)
        .map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  // The message is posted directly to registration.waiting. Do not couple
  // activation to the query string used by an older runtime: a legacy page can
  // discover this newer worker under its old registration URL.
  if (event.data?.type === "TAKKEN_SKIP_WAITING") event.waitUntil(self.skipWaiting());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.open(CACHE_NAME).then((cache) => cache.match(SHELL)))
    );
    return;
  }
  const cachedUrl = IMMUTABLE_BY_PATH.get(requestUrl.pathname);
  if (!cachedUrl) return;
  const requestedVersion = requestUrl.searchParams.get("v") || "";
  event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
    if (requestedVersion && requestedVersion !== VERSION) {
      try {
        return await fetch(event.request);
      } catch {
        return (await cache.match(cachedUrl)) || Response.error();
      }
    }
    return (await cache.match(cachedUrl)) || fetch(event.request);
  }));
});
