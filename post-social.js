#!/usr/bin/env node
/**
 * KAELUM social auto-poster (Bluesky, then X, then Threads)
 * --------------------------------------------------------
 * Mirrors the three KAELUM company-Page posts each day to the KAELUM brand
 * accounts on the secondary platforms, at 09:00 / 15:00 / 18:00 UK.
 *
 * Deliberately independent of post.js (the live LinkedIn engine): its own
 * cron map, its own log file (posted-social-log.json), its own workflow.
 * A failure on one platform never blocks the others, and this never touches
 * the LinkedIn log or LinkedIn posting.
 *
 * Caption: row.shortCaption if present, else row.alt. Every KAELUM row already
 * has a short, compliant, standalone alt line, so no separate caption set is
 * needed. The KAELUM URL is printed on the card image, so no link in the text.
 *
 * DRY_RUN=true builds and previews everything, publishes nothing.
 * Node 18+ (global fetch). No external dependencies.
 */

const fs = require("fs");
const path = require("path");

const bluesky = require("./bluesky");
const x = require("./x");                 // OAuth 1.0a (credentials in GitHub secrets)
const threads = require("./threads");     // Meta Threads API (public image URL)

// Public base for the images repo Threads fetches from. Override via env if the
// repo name ever changes. Image URL = base + "/" + (calendar image minus "images/").
const THREADS_IMAGE_BASE = (process.env.THREADS_IMAGE_BASE ||
  "https://raw.githubusercontent.com/greggar-d/kaelum-social-images/main").replace(/\/+$/, "");
function threadsImageUrl(image) {
  return THREADS_IMAGE_BASE + "/" + image.replace(/^images\//, "");
}

const DRY_RUN = String(process.env.DRY_RUN || "").toLowerCase() === "true";
const SOCIAL_LOG = path.join(__dirname, "posted-social-log.json");

// Which trio slot each UTC cron fires.
// 09:00 / 15:00 / 18:00 UK (BST) = 08:00 / 14:00 / 17:00 UTC.
const SOCIAL_CRON_MAP = {
  "0 8 * * *": 1,
  "0 14 * * *": 2,
  "0 17 * * *": 3,
};

// Per-platform targets. Flip `enabled` to true as each module lands.
function platformTargets() {
  return [
    {
      name: "bluesky",
      enabled: true,
      publish: (job) => bluesky.publish({
        identifier: process.env.BLUESKY_IDENTIFIER,
        appPassword: process.env.BLUESKY_APP_PASSWORD,
        imagePath: job.image, text: job.text, alt: job.alt, dryRun: DRY_RUN,
      }),
    },
    // {
    //   name: "x",
    //   enabled: true,
    //   publish: (job) => x.publish({
    //     apiKey: process.env.X_API_KEY, apiSecret: process.env.X_API_SECRET,
    //     accessToken: process.env.X_ACCESS_TOKEN, accessSecret: process.env.X_ACCESS_SECRET,
    //     imagePath: job.image, text: job.text, alt: job.alt, dryRun: DRY_RUN,
    //   }),
    // },
    {
      name: "x",
      enabled: true,
      publish: (job) => x.publish({
        apiKey: process.env.X_API_KEY, apiSecret: process.env.X_API_SECRET,
        accessToken: process.env.X_ACCESS_TOKEN, accessSecret: process.env.X_ACCESS_SECRET,
        imagePath: job.image, text: job.text, alt: job.alt, dryRun: DRY_RUN,
      }),
    },
    {
      name: "threads",
      enabled: true,
      publish: (job) => threads.publish({
        userId: process.env.THREADS_USER_ID, accessToken: process.env.THREADS_ACCESS_TOKEN,
        imageUrl: threadsImageUrl(job.image), text: job.text, dryRun: DRY_RUN,
      }),
    },
    // {
    //   name: "threads",
    //   enabled: true,
    //   publish: (job) => threads.publish({
    //     userId: process.env.THREADS_USER_ID, accessToken: process.env.THREADS_ACCESS_TOKEN,
    //     imageUrl: job.imageUrl, text: job.text, alt: job.alt, dryRun: DRY_RUN,
    //   }),
    // },
  ];
}

function log(msg) { console.log(msg); }
function fail(msg) { console.error("ERROR: " + msg); process.exit(1); }

function dayIndex(startDate) {
  const start = new Date(startDate + "T00:00:00Z");
  if (isNaN(start)) fail("START_DATE is invalid. Use YYYY-MM-DD.");
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.floor((today - start) / 86400000) + 1; // day 1 is START_DATE itself
}

function resolveSlot() {
  if (process.env.SLOT) return Number(process.env.SLOT);
  const cron = (process.env.TRIGGER_CRON || "").trim();
  if (!cron) fail("No TRIGGER_CRON and no SLOT provided.");
  const slot = SOCIAL_CRON_MAP[cron];
  if (!slot) { log("Cron '" + cron + "' is not a social slot. Nothing to do."); process.exit(0); }
  return slot;
}

function loadCalendar() {
  const file = path.join(__dirname, "content-calendar.json");
  if (!fs.existsSync(file)) fail("content-calendar.json not found.");
  const rows = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(rows)) fail("content-calendar.json must be a JSON array.");
  return rows;
}

function findKaelumRow(rows, slot, day) {
  return rows.find((r) =>
    String(r.destination).toLowerCase() === "kaelum" &&
    Number(r.slot) === slot && Number(r.day) === day);
}

// Some early rows (mostly the social-feed theme) have alt text that was clipped
// mid-sentence when the calendar was built. A caption that ends without terminal
// punctuation is treated as truncated and skipped, unless the row carries an
// explicit shortCaption override. This stops a mid-word caption ever going live.
function looksTruncated(s) {
  const t = (s || "").trim();
  return !/[.!?"'\u2019)]$/.test(t);
}

function readLog() {
  if (!fs.existsSync(SOCIAL_LOG)) return [];
  try { return JSON.parse(fs.readFileSync(SOCIAL_LOG, "utf8")); } catch (_) { return []; }
}
function alreadyPosted(platform, slot, day) {
  return readLog().some((e) =>
    e.platform === platform && Number(e.slot) === slot &&
    Number(e.day) === day && e.status === "posted");
}
function appendLog(entry) {
  const arr = readLog();
  arr.push(entry);
  fs.writeFileSync(SOCIAL_LOG, JSON.stringify(arr, null, 2));
}

(async function main() {
  const startDate = (process.env.START_DATE || "").trim();
  if (!startDate) fail("START_DATE is not set. Use YYYY-MM-DD.");

  const slot = resolveSlot();
  const day = dayIndex(startDate);
  log(`Social trigger -> slot=${slot} day=${day} dryRun=${DRY_RUN}`);

  if (day < 1 || day > 90) { log(`Day ${day} outside the 1-90 window. Nothing to do.`); return; }

  const rows = loadCalendar();
  const row = findKaelumRow(rows, slot, day);
  if (!row) { log(`No KAELUM row for slot ${slot} day ${day}. Skipping.`); return; }

  const usingOverride = !!(row.shortCaption && row.shortCaption.trim());
  const text = usingOverride ? row.shortCaption.trim() : (row.alt || "").trim();
  const alt = (row.alt || "KAELUM").trim();
  if (!text) { log(`Row slot ${slot} day ${day} has no caption text. Skipping.`); return; }

  if (!usingOverride && looksTruncated(text)) {
    log(`Row slot ${slot} day ${day} (${row._folder}) has a truncated alt and no shortCaption. ` +
        `Skipping until a clean shortCaption is added.`);
    return;
  }

  const job = { image: row.image, text, alt, slot, day };

  const limits = { x: 280, bluesky: 300, threads: 500 };
  log(`Caption (${[...text].length} chars): ${text}`);
  Object.entries(limits).forEach(([p, lim]) => {
    if ([...text].length > lim) console.error(`WARNING: caption over the ${p} limit (${lim}).`);
  });

  if (DRY_RUN) {
    log("----- DRY RUN: nothing published -----");
    log("image: " + job.image);
    platformTargets().filter((t) => t.enabled).forEach((t) => log("would post to: " + t.name));
    return;
  }

  let anyFailed = false;
  for (const target of platformTargets()) {
    if (!target.enabled) continue;
    if (alreadyPosted(target.name, slot, day)) {
      log(`${target.name}: already posted slot ${slot} day ${day}. Skipping to avoid a duplicate.`);
      continue;
    }
    try {
      const res = await target.publish(job);
      log(`${target.name}: published -> ${res.id}`);
      appendLog({ platform: target.name, slot, day, image: job.image, id: res.id, status: "posted", at: new Date().toISOString() });
    } catch (e) {
      anyFailed = true;
      console.error(`${target.name}: FAILED -> ${e.message}`);
      appendLog({ platform: target.name, slot, day, image: job.image, status: "failed", error: e.message, at: new Date().toISOString() });
    }
  }

  // Exit 0 even on a single-platform failure: the log records it and the other
  // platforms still went out. Failures are visible in the run output above.
  if (anyFailed) log("One or more platforms failed. See errors above; successes are logged.");
})().catch((e) => fail(e.stack || String(e)));
