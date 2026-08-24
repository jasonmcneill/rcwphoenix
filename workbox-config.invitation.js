"use strict";

// Generates public/invitation/sw.js so PWA Builder (and any installed
// PWA/TWA) has a service worker to detect and offline support for the
// invitation route. Run via `npm run build:invitation` after editing
// anything under public/invitation, public/css/styles.css, or the shared
// assets referenced by public/invitation/index.ejs, then commit the
// generated sw.js — deploy is a plain `git pull` on the server, there is
// no server-side build step.

module.exports = {
  globDirectory: "public",
  globPatterns: [
    "invitation/invitation.css",
    "invitation/invitation.js",
    "invitation/favicon.png",
    "invitation/launchicon/**/*.{png,ico,svg,webmanifest}",
    "css/styles.css",
    "assets/bootstrap-5.0.2-dist/css/bootstrap-utilities.min.css",
    "assets/qrcode-generator/qrcode.js",
    "assets/logo-desert.avif",
  ],
  swDest: "public/invitation/sw.js",
  // Bundle the Workbox runtime into sw.js itself instead of emitting a
  // separately-hashed workbox-<hash>.js alongside it — otherwise every
  // Workbox version bump leaves the previous hashed file orphaned on disk.
  inlineWorkboxRuntime: true,
  skipWaiting: true,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
  runtimeCaching: [
    {
      // The /invitation/ and /invitation/:sender pages are rendered
      // server-side from EJS, so there's no static HTML file to precache.
      // Strict NetworkFirst, no networkTimeoutSeconds: times/dates/locations
      // live on this page, so we always wait for a real network response
      // rather than racing a timeout and risking stale info. The cached
      // copy is only ever used when the network request outright fails.
      urlPattern: /^https:\/\/[^/]+\/invitation\/([^/]*)?$/,
      handler: "NetworkFirst",
      options: {
        cacheName: "invitation-pages",
        expiration: { maxEntries: 10, maxAgeSeconds: 24 * 60 * 60 },
      },
    },
    {
      // Flyer/event images change filename each time an event is updated,
      // so cache them at runtime instead of pinning today's filenames into
      // the build-time precache manifest.
      urlPattern: /\/assets\/.*\.(?:png|jpe?g|avif|webp|svg)$/,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "invitation-images",
        expiration: { maxEntries: 30, maxAgeSeconds: 30 * 24 * 60 * 60 },
      },
    },
    {
      urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
      handler: "StaleWhileRevalidate",
      options: { cacheName: "google-fonts-stylesheets" },
    },
    {
      urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
      handler: "CacheFirst",
      options: {
        cacheName: "google-fonts-webfonts",
        expiration: { maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 },
      },
    },
  ],
};
