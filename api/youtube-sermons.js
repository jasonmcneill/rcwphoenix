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
//      show up within ~15 min.
//   2. Hard cap: a backstop against runaway refreshes (e.g. a TTL bug or an
//      abusive client) — never make more than MAX_REFRESHES_PER_DAY live
//      refreshes in any rolling 24h window, even across restarts (timestamps
//      are persisted in the cache). Each refresh may issue several API calls
//      (playlist paging + batched video-detail lookups), but the count stays
//      comfortably under the 10,000-unit/day free quota. Set high enough that
//      the TTL, not the cap, is the normal limiter.
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REFRESHES_PER_DAY = 120;
const DAY_MS = 24 * 60 * 60 * 1000;

// Persist the cache in the OS temp dir so it survives restarts but is never
// committed to the repo.
const CACHE_FILE = path.join(os.tmpdir(), "rcwphoenix-youtube-sermons.json");

// In-process lock so concurrent requests trigger at most one live API call.
let inFlight = null;

async function readCache() {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data.callTimestamps)) data.callTimestamps = [];
    if (!Array.isArray(data.sermons)) data.sermons = null;
    return data;
  } catch {
    return { sermons: null, fetchedAt: 0, callTimestamps: [] };
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

// The date used to order and display a sermon: prefer the owner-entered
// recording date, then the live broadcast start, then the upload date.
function sermonDate(sermon) {
  return (
    sermon.recordingDate || sermon.actualStartTime || sermon.publishedAt || ""
  );
}

// Fetch every video in the playlist via the YouTube Data API and return them
// sorted in reverse chronological order (newest first).
async function fetchAllSermons(apiKey) {
  const items = (await fetchAllPlaylistItems(apiKey)).filter((item) => {
    // status.privacyStatus reflects the playlist item's own visibility and
    // does not reliably flip when a video already in the playlist is later
    // made private. When that happens, YouTube instead replaces the item's
    // snippet with a fixed placeholder ("Private video" / "This video is
    // private."), so check for that too.
    if (item.status?.privacyStatus === "private") return false;
    if (
      item.snippet?.title === "Private video" &&
      item.snippet?.description === "This video is private."
    ) {
      return false;
    }
    // A video deleted by its owner isn't flagged via privacyStatus either;
    // YouTube instead replaces the item's snippet with this placeholder.
    if (
      item.snippet?.title === "Deleted video" ||
      item.snippet?.description === "This video is unavailable."
    ) {
      return false;
    }
    return true;
  });
  if (!items.length) return [];

  const publishedAt = (item) =>
    item.contentDetails?.videoPublishedAt || item.snippet?.publishedAt || "";

  // Map each playlist item to its video id, dropping any without one.
  const videoIds = items
    .map(
      (item) =>
        item.contentDetails?.videoId || item.snippet?.resourceId?.videoId,
    )
    .filter(Boolean);

  // The playlist response has no duration or recording date, so fetch those
  // extra details from videos.list — batched (up to 50 ids per call) to keep
  // the API cost low.
  const detailsById = await fetchVideoDetails(videoIds, apiKey);

  const sermons = items
    .map((item) => {
      const videoId =
        item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
      if (!videoId) return null;
      const details = detailsById.get(videoId) || {
        duration: "",
        recordingDate: "",
        actualStartTime: "",
      };
      return {
        videoId,
        title: item.snippet?.title || "",
        description: item.snippet?.description || "",
        publishedAt: publishedAt(item),
        // The "Recording date" field set in YouTube Studio (date-only, e.g.
        // "2026-06-21T00:00:00Z"); empty if the uploader didn't fill it in.
        recordingDate: details.recordingDate, // ISO 8601 date or ""
        // For live-streamed/premiered sermons, the actual broadcast instant.
        actualStartTime: details.actualStartTime, // ISO 8601 timestamp or ""
        duration: details.duration, // ISO 8601, e.g. "PT1H2M3S"
        durationText: formatDuration(details.duration), // e.g. "1:02:03"
        thumbnails: item.snippet?.thumbnails || {},
        url: `https://www.youtube.com/watch?v=${videoId}`,
      };
    })
    .filter(Boolean);

  // Playlist items are not necessarily ordered by date, so sort explicitly.
  sermons.sort((a, b) => sermonDate(b).localeCompare(sermonDate(a)));
  return sermons;
}

// Page through playlistItems.list, collecting every item in the playlist.
async function fetchAllPlaylistItems(apiKey) {
  const items = [];
  let pageToken = "";
  // Guard against an unexpected paging loop; a playlist can hold thousands of
  // items, but 40 pages (2,000 items) is far more than this church will have.
  for (let page = 0; page < 40; page++) {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("part", "snippet,contentDetails,status");
    url.searchParams.set("playlistId", PLAYLIST_ID);
    url.searchParams.set("maxResults", "50");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    url.searchParams.set("key", apiKey);

    const resp = await fetch(url);
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(
        `YouTube API responded ${resp.status} ${resp.statusText}: ${text}`,
      );
    }

    const body = await resp.json();
    if (Array.isArray(body.items)) items.push(...body.items);
    pageToken = body.nextPageToken || "";
    if (!pageToken) break;
  }
  return items;
}

// Fetch duration, recording date, and live broadcast time for many videos via
// the videos.list endpoint. Accepts up to 50 ids per call, so batch the ids.
// Returns a Map of videoId -> details.
async function fetchVideoDetails(videoIds, apiKey) {
  const detailsById = new Map();

  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set(
      "part",
      "contentDetails,recordingDetails,liveStreamingDetails",
    );
    url.searchParams.set("id", chunk.join(","));
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("key", apiKey);

    const resp = await fetch(url);
    if (!resp.ok) {
      // These details are non-essential; don't fail the whole request over
      // them — the affected sermons just render without a duration/date.
      console.error(`videos.list responded ${resp.status} ${resp.statusText}`);
      continue;
    }
    const body = await resp.json();
    for (const item of body.items || []) {
      detailsById.set(item.id, {
        duration: item.contentDetails?.duration || "",
        recordingDate: item.recordingDetails?.recordingDate || "",
        actualStartTime: item.liveStreamingDetails?.actualStartTime || "",
      });
    }
  }

  return detailsById;
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

// Return all sermons (newest first), refreshing from the API only when allowed.
async function getSermons() {
  const now = Date.now();
  const cache = await readCache();

  // 1. Fresh enough — serve straight from cache.
  if (cache.sermons && now - cache.fetchedAt < CACHE_TTL_MS) {
    return { sermons: cache.sermons, cached: true };
  }

  // 2. Rolling-window cap reached — serve stale cache rather than call the API.
  const recentCalls = callsInLastDay(cache.callTimestamps, now);
  if (recentCalls.length >= MAX_REFRESHES_PER_DAY) {
    return { sermons: cache.sermons, cached: true, capped: true };
  }

  const apiKey = process.env.YOUTUBE_DATA_API_KEY_1;
  if (!apiKey) {
    if (cache.sermons) return { sermons: cache.sermons, cached: true };
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
        const sermons = await fetchAllSermons(apiKey);
        await writeCache({
          sermons: sermons.length ? sermons : cache.sermons,
          fetchedAt: attemptAt,
          callTimestamps,
        });
        return sermons.length ? sermons : cache.sermons;
      } catch (err) {
        // Persist the attempt timestamp (keeping the old fetchedAt) so the
        // failure still counts against the cap, then re-throw.
        await writeCache({
          sermons: cache.sermons,
          fetchedAt: cache.fetchedAt,
          callTimestamps,
        });
        throw err;
      }
    })().finally(() => {
      inFlight = null;
    });
  }

  const sermons = await inFlight;
  return { sermons, cached: false };
}

router.get("/", async (req, res) => {
  try {
    const result = await getSermons();
    if (!result.sermons || !result.sermons.length) {
      return res
        .status(404)
        .json({ ok: false, error: "No sermons found in playlist." });
    }
    res.json({ ok: true, sermons: result.sermons });
  } catch (err) {
    console.error("Failed to fetch YouTube sermons:", err);
    res.status(502).json({ ok: false, error: "Failed to fetch sermons." });
  }
});

module.exports = router;
