#!/usr/bin/env node
/**
 * KAELUM LinkedIn auto-poster
 * ---------------------------
 * Fires from a GitHub Actions schedule. Works out which slot triggered it,
 * which day of the 90 day campaign we are on, finds the matching post in
 * content-calendar.json, and publishes it to LinkedIn.
 *
 * Posts to:
 *   - Greggar Deterville personal profile  (09:00 / 15:00 / 18:00 UK)
 *   - KAELUM company Page                   (12:00 / 14:00 / 21:00 UK)
 *
 * Set DRY_RUN=true to run the full lookup and payload build WITHOUT calling
 * LinkedIn. Nothing is published. Use this to test before going live.
 *
 * Node 18+ required (uses global fetch). No external dependencies.
 */

const fs = require("fs");
const path = require("path");

const LINKEDIN_VERSION = process.env.LINKEDIN_VERSION || "202606"; // YYYYMM, bump monthly
const API = "https://api.linkedin.com/rest";
const DRY_RUN = String(process.env.DRY_RUN || "").toLowerCase() === "true";

/**
 * Maps each UTC cron (the value GitHub puts in github.event.schedule) to a
 * destination and slot. UK clocks are BST (UTC+1) for the whole campaign
 * window if you start between late March and late October, so UK time minus
 * one hour = UTC. If your run crosses the late-October clock change, see the
 * note in README ("Clock changes").
 *
 *   08:00 UTC = 09:00 BST  personal slot 1
 *   11:00 UTC = 12:00 BST  kaelum   slot 1
 *   13:00 UTC = 14:00 BST  kaelum   slot 2
 *   14:00 UTC = 15:00 BST  personal slot 2
 *   17:00 UTC = 18:00 BST  personal slot 3
 *   20:00 UTC = 21:00 BST  kaelum   slot 3
 */
const CRON_MAP = {
  "0 8 * * *":  { destination: "personal", slot: 1 },
  "0 11 * * *": { destination: "kaelum",   slot: 1 },
  "0 13 * * *": { destination: "kaelum",   slot: 2 },
  "0 14 * * *": { destination: "personal", slot: 2 },
  "0 17 * * *": { destination: "personal", slot: 3 },
  "0 20 * * *": { destination: "kaelum",   slot: 3 },
};

function fail(msg) {
  console.error("ERROR: " + msg);
  process.exit(1);
}

function authorUrn(destination) {
  if (destination === "personal") {
    const urn = process.env.LINKEDIN_PERSON_URN;
    if (!urn) {
      if (DRY_RUN) return "urn:li:person:(not set in dry run)";
      fail("LINKEDIN_PERSON_URN secret is not set.");
    }
    return urn; // urn:li:person:XXXX
  }
  const urn = process.env.LINKEDIN_ORG_URN;
  if (!urn) {
    if (DRY_RUN) return "urn:li:organization:(not set in dry run)";
    fail("LINKEDIN_ORG_URN secret is not set.");
  }
  return urn; // urn:li:organization:XXXX
}

// Whole days between two dates, ignoring time of day.
function dayIndex(startDate) {
  const start = new Date(startDate + "T00:00:00Z");
  if (isNaN(start)) fail("START_DATE is invalid. Use YYYY-MM-DD.");
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const diff = Math.floor((today - start) / 86400000);
  return diff + 1; // day 1 is START_DATE itself
}

function resolveTrigger() {
  // GitHub passes the triggering cron in github.event.schedule, which the
  // workflow forwards as TRIGGER_CRON. For local testing you can instead set
  // DESTINATION and SLOT directly.
  if (process.env.DESTINATION && process.env.SLOT) {
    return { destination: process.env.DESTINATION, slot: Number(process.env.SLOT) };
  }
  const cron = process.env.TRIGGER_CRON;
  if (!cron) fail("No TRIGGER_CRON and no DESTINATION/SLOT provided.");
  const hit = CRON_MAP[cron.trim()];
  if (!hit) fail("TRIGGER_CRON '" + cron + "' is not in CRON_MAP.");
  return hit;
}

function loadManifest() {
  const file = path.join(__dirname, "content-calendar.json");
  if (!fs.existsSync(file)) fail("content-calendar.json not found.");
  const rows = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(rows)) fail("content-calendar.json must be a JSON array.");
  return rows;
}

function findPost(rows, destination, slot, day) {
  return rows.find(
    (r) => r.destination.toLowerCase() === destination.toLowerCase() && Number(r.slot) === slot && Number(r.day) === day
  );
}

// ---- LinkedIn API calls (only reached when DRY_RUN is false) -------------

async function initImageUpload(token, owner) {
// Both personal (person URN) and Page (org URN) use the SAME modern
  // /rest/images endpoint. Only the owner URN differs. The legacy
  // /assets registerUpload path is removed: it returned a digitalmediaAsset
  // URN that the modern Posts API content.media.id field does not accept,
  // and it 403s for person URNs.
  const res = await fetch(API + "/images?action=initializeUpload", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ initializeUploadRequest: { owner } }),
  });
  const text = await res.text();
  if (!res.ok) fail("initializeUpload failed: " + res.status + " " + text);
  const data = JSON.parse(text);
  return { uploadUrl: data.value.uploadUrl, imageUrn: data.value.image }; 
  }

async function uploadImageBytes(uploadUrl, token, imagePath) {
  const bytes = fs.readFileSync(path.join(__dirname, imagePath));
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: bytes,
  });
  if (!res.ok) fail("image byte upload failed: " + res.status + " " + (await res.text()));
}

async function createPost(token, author, commentary, imageUrn, altText) {
  const body = {
    author,
    commentary,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    content: { media: { title: altText, id: imageUrn } },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  const res = await fetch(API + "/posts", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) fail("createPost failed: " + res.status + " " + (await res.text()));
  return res.headers.get("x-restli-id") || res.headers.get("x-linkedin-id") || "(id not returned)";
}

function logPosted(entry) {
  const file = path.join(__dirname, "posted-log.json");
  let log = [];
  if (fs.existsSync(file)) {
    try { log = JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) { log = []; }
  }
  log.push(entry);
  fs.writeFileSync(file, JSON.stringify(log, null, 2));
}


function alreadyPosted(destination, slot, day) {
  const file = path.join(__dirname, "posted-log.json");
  if (!fs.existsSync(file)) return false;
  let log = [];
  try { log = JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) { return false; }
  return log.some(
    (e) => e.destination === destination && Number(e.slot) === slot && Number(e.day) === day && e.status === "posted"
  );
}

(async function main() {
  const startDate = (process.env.START_DATE || "").trim();
  if (!startDate) fail("START_DATE secret/var is not set. Use YYYY-MM-DD.");

  const { destination, slot } = resolveTrigger();
  const day = dayIndex(startDate);

  console.log(`Trigger -> destination=${destination} slot=${slot} day=${day} dryRun=${DRY_RUN}`);

    if (day < 1 || day > 120) {
    console.log(`Day ${day} is outside the 1-120 campaign window. Nothing to do.`);
    return;
  }

  

  const rows = loadManifest();
  const post = findPost(rows, destination, slot, day);
  if (!post) {
    console.log(`No calendar entry for ${destination} slot ${slot} day ${day}. Skipping (write the caption to publish it).`);
    return;
  }

  const commentary = post.hashtags ? `${post.caption}\n\n${post.hashtags}` : post.caption;
  const owner = authorUrn(destination);
  const altText = post.alt || "KAELUM";

  if (DRY_RUN) {
    console.log("----- DRY RUN: nothing published -----");
    console.log("author: " + owner);
    console.log("image:  " + post.image);
    console.log("commentary:\n" + commentary);
    console.log("character count: " + commentary.length + " (LinkedIn hard limit 3000)");
    if (commentary.length > 3000) console.error("WARNING: over 3000 characters, LinkedIn will reject this.");
    return;
  }

  if (alreadyPosted(destination, slot, day)) {
    console.log(`Already posted ${destination} slot ${slot} day ${day}. Skipping to avoid a duplicate.`);
    return;
  }

  const token =
  destination === "personal"
    ? process.env.LINKEDIN_PERSONAL_TOKEN
    : process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token) {
    if (DRY_RUN) console.log("(LINKEDIN_ACCESS_TOKEN not set in dry run, skipping token check)");
    else fail("LINKEDIN_ACCESS_TOKEN secret is not set.");
  }

  const { uploadUrl, imageUrn } = await initImageUpload(token, owner);
  await uploadImageBytes(uploadUrl, token, post.image);
  const postId = await createPost(token, owner, commentary, imageUrn, altText);

  console.log("Published. Post id: " + postId);
  logPosted({
    destination, slot, day, image: post.image,
    postId, status: "posted", at: new Date().toISOString(),
  });
})().catch((e) => fail(e.stack || String(e)));
