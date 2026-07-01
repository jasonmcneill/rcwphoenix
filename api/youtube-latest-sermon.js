const express = require("express");
const path = require("path");
const os = require("os");
const fs = require("fs/promises");

const router = express.Router();

// The playlist to read from. The value the site uses is pasted from a YouTube
// URL, so strip any trailing query parameters (e.g. "&pp=...") that are not
// part of the actual playlist ID.
const RAW_PLAYLIST_ID =
  process.env.YOUTUBE_PLAYLIST_ID || "PLO-Ixs8Wr7Wc&pp=sAgC";
const PLAYLIST_ID = RAW_PLAYLIST_ID.split(/[&?]/)[0].trim();

// Caching strategy --------------------------------------------------------
// Keep content reasonably fresh while never hammering the YouTube Data API.
// Two independent guards work together:
//   1. TTL: serve the cached result for 15 min before considering a refresh.
//      This is the everyday pacer — new videos and edited recording dates
//      show up within ~15 min. At most ~96 refreshes/day (2 API units each,
//      well under the 10,000-unit/day free quota).
//   2. Hard cap: a backstop against runaway refreshes (e.g. a TTL bug or an
//      abusive client) — never make more than MAX_CALLS_PER_DAY live calls in
//      any rolling 24h window, even across restarts (timestamps are persisted
//      in the cache). Set high enough that the TTL, not the cap, is the normal
//      limiter.
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_CALLS_PER_DAY = 120;
const DAY_MS = 24 * 60 * 60 * 1000;

// Persist the cache in the OS temp dir so it survives restarts but is never
// committed to the repo.
const CACHE_FILE = path.join(os.tmpdir(), "rcwphoenix-youtube-latest.json");

// In-process lock so concurrent requests trigger at most one live API call.
let inFlight = null;

async function readCache() {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data.callTimestamps)) data.callTimestamps = [];
    return data;
  } catch {
    return { video: null, fetchedAt: 0, callTimestamps: [] };
  }
}

async function writeCache(data) {
  try {
    await fs.writeFile(CACHE_FILE, JSON.stringify(data), "utf8");
  } catch (err) {
    // A cache write failure should not break the response; just log it.
    console.error("Failed to write YouTube cache file:", err);
  }
}

function callsInLastDay(timestamps, now) {
  return timestamps.filter((t) => now - t < DAY_MS);
}

// Fetch the latest video from the playlist via the YouTube Data API.
async function fetchLatestVideo(apiKey) {
  const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
  url.searchParams.set("part", "snippet,contentDetails");
  url.searchParams.set("playlistId", PLAYLIST_ID);
  url.searchParams.set("maxResults", "50");
  url.searchParams.set("key", apiKey);

  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `YouTube API responded ${resp.status} ${resp.statusText}: ${text}`,
    );
  }

  const body = await resp.json();
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return null;

  // Playlist items are not necessarily ordered by date, so pick the most
  // recently published video explicitly.
  const publishedAt = (item) =>
    item.contentDetails?.videoPublishedAt ||
    item.snippet?.publishedAt ||
    "";
  items.sort((a, b) => publishedAt(b).localeCompare(publishedAt(a)));

  const latest = items[0];
  const videoId =
    latest.contentDetails?.videoId || latest.snippet?.resourceId?.videoId;

  // The playlist response has no duration or recording date, so fetch the
  // extra details from videos.list.
  const details = videoId
    ? await fetchVideoDetails(videoId, apiKey)
    : { duration: "", recordingDate: "", actualStartTime: "" };

  return {
    videoId,
    title: latest.snippet?.title || "",
    description: latest.snippet?.description || "",
    publishedAt: publishedAt(latest),
    // The "Recording date" field set in YouTube Studio (date-only, e.g.
    // "2026-06-21T00:00:00Z"); empty if the uploader didn't fill it in.
    recordingDate: details.recordingDate, // ISO 8601 date or ""
    // For live-streamed/premiered sermons, the actual broadcast instant.
    actualStartTime: details.actualStartTime, // ISO 8601 timestamp or ""
    duration: details.duration, // ISO 8601, e.g. "PT1H2M3S"
    durationText: formatDuration(details.duration), // e.g. "1:02:03"
    thumbnails: latest.snippet?.thumbnails || {},
    url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null,
  };
}

// Fetch a video's duration, recording date, and live broadcast time via the
// videos.list endpoint.
async function fetchVideoDetails(videoId, apiKey) {
  const empty = { duration: "", recordingDate: "", actualStartTime: "" };
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set(
    "part",
    "contentDetails,recordingDetails,liveStreamingDetails",
  );
  url.searchParams.set("id", videoId);
  url.searchParams.set("key", apiKey);

  const resp = await fetch(url);
  if (!resp.ok) {
    // These details are non-essential; don't fail the whole request over them.
    console.error(`videos.list responded ${resp.status} ${resp.statusText}`);
    return empty;
  }
  const item = (await resp.json()).items?.[0];
  if (!item) return empty;
  return {
    duration: item.contentDetails?.duration || "",
    recordingDate: item.recordingDetails?.recordingDate || "",
    actualStartTime: item.liveStreamingDetails?.actualStartTime || "",
  };
}

// Convert an ISO 8601 duration ("PT1H2M3S") to display form ("1:02:03").
function formatDuration(iso) {
  if (!iso) return "";
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return "";
  const h = Number(match[1] || 0);
  const m = Number(match[2] || 0);
  const s = Number(match[3] || 0);
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// Return the latest video, refreshing from the API only when allowed.
async function getLatestVideo() {
  const now = Date.now();
  const cache = await readCache();

  // 1. Fresh enough — serve straight from cache.
  if (cache.video && now - cache.fetchedAt < CACHE_TTL_MS) {
    return { video: cache.video, cached: true };
  }

  // 2. Rolling-window cap reached — serve stale cache rather than call the API.
  const recentCalls = callsInLastDay(cache.callTimestamps, now);
  if (recentCalls.length >= MAX_CALLS_PER_DAY) {
    return { video: cache.video, cached: true, capped: true };
  }

  const apiKey = process.env.YOUTUBE_DATA_API_KEY_1;
  if (!apiKey) {
    if (cache.video) return { video: cache.video, cached: true };
    throw new Error("Missing YOUTUBE_DATA_API_KEY_1 environment variable.");
  }

  // 3. Refresh — dedupe concurrent refreshes behind a single in-flight call.
  if (!inFlight) {
    inFlight = (async () => {
      const attemptAt = Date.now();
      // Record the attempt up-front so even a failed call counts toward the
      // rolling cap. This prevents a persistently-failing key from being
      // retried on every request and burning through the daily quota.
      const callTimestamps = [...recentCalls, attemptAt];
      try {
        const video = await fetchLatestVideo(apiKey);
        await writeCache({
          video: video || cache.video,
          fetchedAt: attemptAt,
          callTimestamps,
        });
        return video || cache.video;
      } catch (err) {
        // Persist the attempt timestamp (keeping the old fetchedAt) so the
        // failure still counts against the cap, then re-throw.
        await writeCache({
          video: cache.video,
          fetchedAt: cache.fetchedAt,
          callTimestamps,
        });
        throw err;
      }
    })().finally(() => {
      inFlight = null;
    });
  }

  const video = await inFlight;
  return { video, cached: false };
}

router.get("/", async (req, res) => {
  try {
    const result = await getLatestVideo();
    if (!result.video) {
      return res
        .status(404)
        .json({ ok: false, error: "No video found in playlist." });
    }
    res.json({ ok: true, video: result.video });
  } catch (err) {
    console.error("Failed to fetch latest YouTube video:", err);
    res
      .status(502)
      .json({ ok: false, error: "Failed to fetch latest video." });
  }
});

module.exports = router;
