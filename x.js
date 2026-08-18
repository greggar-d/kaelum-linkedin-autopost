// x.js
// KAELUM autopost, X (Twitter) publisher.
// Zero dependencies: global fetch/FormData/Blob (Node 18+) and Node's built-in
// crypto for OAuth 1.0a HMAC-SHA1 request signing.
//
// Exports: publish({ apiKey, apiSecret, accessToken, accessSecret,
//                     imagePath, text, alt, dryRun })
// Returns: { platform: "x", id: <status url> } on success. Throws on failure.
//
// Credentials are OAuth 1.0a user-context:
//   apiKey       = Consumer Key        (X secret X_API_KEY)
//   apiSecret    = Consumer Key Secret (X secret X_API_SECRET)
//   accessToken  = Access Token        (X secret X_ACCESS_TOKEN)
//   accessSecret = Access Token Secret (X secret X_ACCESS_SECRET)
//
// Flow: upload media (v1.1) -> set alt text (best effort) -> create post (v2).

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const TEXT_LIMIT = 280;
const MEDIA_URL = "https://upload.twitter.com/1.1/media/upload.json";
const META_URL = "https://upload.twitter.com/1.1/media/metadata/create.json";
const TWEET_URL = "https://api.twitter.com/2/tweets";
const HANDLE = "kaelumtechno";

function mimeFor(p) {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

// RFC 3986 percent-encoding (encodeURIComponent plus ! * ' ( )).
function pe(s) {
  return encodeURIComponent(String(s)).replace(/[!*'()]/g, (c) =>
    "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

// Pure signature computation, isolated so it can be unit-tested against X's
// published example. allParams must include every oauth_* param plus any query
// or form-urlencoded body params (none of our calls use those).
function computeSignature(method, baseUrl, allParams, apiSecret, tokenSecret) {
  const paramString = Object.keys(allParams).sort()
    .map((k) => pe(k) + "=" + pe(allParams[k])).join("&");
  const base = [method.toUpperCase(), pe(baseUrl), pe(paramString)].join("&");
  const signingKey = pe(apiSecret) + "&" + pe(tokenSecret);
  return crypto.createHmac("sha1", signingKey).update(base).digest("base64");
}

function authHeader(method, baseUrl, creds, extraParams) {
  const oauth = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };
  const allParams = { ...oauth, ...(extraParams || {}) };
  oauth.oauth_signature = computeSignature(method, baseUrl, allParams, creds.apiSecret, creds.accessSecret);
  return "OAuth " + Object.keys(oauth).sort()
    .map((k) => pe(k) + '="' + pe(oauth[k]) + '"').join(", ");
}

async function uploadMedia(creds, imagePath) {
  const abs = path.join(__dirname, imagePath);
  if (!fs.existsSync(abs)) throw new Error("x: image not found on disk: " + imagePath);
  const bytes = fs.readFileSync(abs);
  const form = new FormData();
  form.append("media", new Blob([bytes], { type: mimeFor(imagePath) }), "image" + path.extname(imagePath));
  // multipart body: OAuth signature covers only the oauth_* params.
  const res = await fetch(MEDIA_URL, {
    method: "POST",
    headers: { Authorization: authHeader("POST", MEDIA_URL, creds, {}) },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error("x media upload failed: " + res.status + " " + text);
  return JSON.parse(text).media_id_string;
}

async function setAltText(creds, mediaId, alt) {
  if (!alt) return;
  try {
    const res = await fetch(META_URL, {
      method: "POST",
      headers: { Authorization: authHeader("POST", META_URL, creds, {}), "Content-Type": "application/json" },
      body: JSON.stringify({ media_id: mediaId, alt_text: { text: alt.slice(0, 1000) } }),
    });
    if (!res.ok) console.error("x: alt text skipped (" + res.status + ")");
  } catch (e) {
    console.error("x: alt text skipped (" + e.message + ")");
  }
}

async function createTweet(creds, text, mediaId) {
  const res = await fetch(TWEET_URL, {
    method: "POST",
    headers: { Authorization: authHeader("POST", TWEET_URL, creds, {}), "Content-Type": "application/json" },
    body: JSON.stringify({ text, media: { media_ids: [mediaId] } }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error("x create tweet failed: " + res.status + " " + body);
  return JSON.parse(body).data.id;
}

async function publish({ apiKey, apiSecret, accessToken, accessSecret, imagePath, text, alt, dryRun }) {
  if (!text || !text.trim()) throw new Error("x: empty caption text");
  if ([...text].length > TEXT_LIMIT) {
    throw new Error("x: caption is " + [...text].length + " characters, over " + TEXT_LIMIT);
  }
  if (dryRun) return { platform: "x", id: "(dry run, nothing published)" };
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    throw new Error("x: missing OAuth 1.0a credentials (X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_SECRET)");
  }
  const creds = { apiKey, apiSecret, accessToken, accessSecret };
  const mediaId = await uploadMedia(creds, imagePath);
  await setAltText(creds, mediaId, alt);
  const id = await createTweet(creds, text, mediaId);
  return { platform: "x", id: "https://x.com/" + HANDLE + "/status/" + id };
}

module.exports = { publish, computeSignature };
