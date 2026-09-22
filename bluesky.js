// bluesky.js
// KAELUM autopost, Bluesky publisher (AT Protocol).
// Zero dependencies: global fetch (Node 18+) and Node built-ins only.
//
// Exports: publish({ identifier, appPassword, imagePath, text, alt, dryRun })
// Returns: { platform: "bluesky", id: <post uri> } on success. Throws on failure.
//
// Flow: createSession -> uploadBlob -> createRecord (app.bsky.feed.post with an
// embedded image). The KAELUM URL is printed on the card, so no link facet is
// needed in the text.

const fs = require("fs");
const path = require("path");

const PDS = "https://bsky.social";
const TEXT_LIMIT = 300;        // Bluesky counts graphemes; 280-char captions sit safely under this.
const BLOB_LIMIT = 2000000;    // Bytes. Raised from 1,000,000; this PDS accepts ~1.7 MB uploads.

function mimeFor(p) {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

async function createSession(identifier, appPassword) {
  const res = await fetch(PDS + "/xrpc/com.atproto.server.createSession", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password: appPassword }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error("bluesky createSession failed: " + res.status + " " + text);
  const data = JSON.parse(text);
  return { jwt: data.accessJwt, did: data.did };
}

async function uploadBlob(jwt, imagePath) {
  const abs = path.join(__dirname, imagePath);
  if (!fs.existsSync(abs)) throw new Error("bluesky: image not found on disk: " + imagePath);
  const bytes = fs.readFileSync(abs);
  if (bytes.length > BLOB_LIMIT) {
    throw new Error(
      "bluesky: image " + imagePath + " is " + bytes.length + " bytes, over the " +
      BLOB_LIMIT + " byte limit. A compressed copy is needed for Bluesky."
    );
  }
  const res = await fetch(PDS + "/xrpc/com.atproto.repo.uploadBlob", {
    method: "POST",
    headers: { Authorization: "Bearer " + jwt, "Content-Type": mimeFor(imagePath) },
    body: bytes,
  });
  const text = await res.text();
  if (!res.ok) throw new Error("bluesky uploadBlob failed: " + res.status + " " + text);
  return JSON.parse(text).blob;
}

async function createRecord(jwt, did, text, alt, blob) {
  const record = {
    $type: "app.bsky.feed.post",
    text: text,
    createdAt: new Date().toISOString(),
    langs: ["en"],
    embed: {
      $type: "app.bsky.embed.images",
      images: [{ alt: alt || "", image: blob }],
    },
  };
  const res = await fetch(PDS + "/xrpc/com.atproto.repo.createRecord", {
    method: "POST",
    headers: { Authorization: "Bearer " + jwt, "Content-Type": "application/json" },
    body: JSON.stringify({ repo: did, collection: "app.bsky.feed.post", record }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error("bluesky createRecord failed: " + res.status + " " + body);
  return JSON.parse(body).uri;
}

async function publish({ identifier, appPassword, imagePath, text, alt, dryRun }) {
  if (!text || !text.trim()) throw new Error("bluesky: empty caption text");
  if ([...text].length > TEXT_LIMIT) {
    throw new Error("bluesky: caption is " + [...text].length + " graphemes, over " + TEXT_LIMIT);
  }
  if (dryRun) return { platform: "bluesky", id: "(dry run, nothing published)" };
  if (!identifier || !appPassword) {
    throw new Error("bluesky: BLUESKY_IDENTIFIER / BLUESKY_APP_PASSWORD not set");
  }
  const { jwt, did } = await createSession(identifier, appPassword);
  const blob = await uploadBlob(jwt, imagePath);
  const uri = await createRecord(jwt, did, text, alt, blob);
  return { platform: "bluesky", id: uri };
}

module.exports = { publish };
