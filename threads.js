// threads.js
// KAELUM autopost, Threads publisher (Meta Threads API).
// Zero dependencies: global fetch (Node 18+) only.
//
// Exports: publish({ userId, accessToken, imageUrl, text, dryRun })
// Returns: { platform: "threads", id: <thread id> } on success. Throws on failure.
//
// Threads has no file upload. It fetches the image from a PUBLIC https URL, so
// post-social.js builds imageUrl from the public images repo and passes it in.
//
// Two-step publish, per the Threads API:
//   1) create a media container (POST /{user-id}/threads, media_type=IMAGE)
//   2) publish that container (POST /{user-id}/threads_publish)
// A short wait between the two lets Meta finish fetching the image.

const GRAPH = "https://graph.threads.net/v1.0";
const TEXT_LIMIT = 500;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function createContainer(userId, token, imageUrl, text) {
  const url = new URL(`${GRAPH}/${userId}/threads`);
  url.searchParams.set("media_type", "IMAGE");
  url.searchParams.set("image_url", imageUrl);
  url.searchParams.set("text", text);
  url.searchParams.set("access_token", token);
  const res = await fetch(url, { method: "POST" });
  const body = await res.text();
  if (!res.ok) throw new Error("threads createContainer failed: " + res.status + " " + body);
  const id = JSON.parse(body).id;
  if (!id) throw new Error("threads createContainer returned no id: " + body);
  return id;
}

async function publishContainer(userId, token, creationId) {
  const url = new URL(`${GRAPH}/${userId}/threads_publish`);
  url.searchParams.set("creation_id", creationId);
  url.searchParams.set("access_token", token);
  const res = await fetch(url, { method: "POST" });
  const body = await res.text();
  if (!res.ok) throw new Error("threads publish failed: " + res.status + " " + body);
  const id = JSON.parse(body).id;
  if (!id) throw new Error("threads publish returned no id: " + body);
  return id;
}

async function publish({ userId, accessToken, imageUrl, text, dryRun }) {
  if (!text || !text.trim()) throw new Error("threads: empty caption text");
  if ([...text].length > TEXT_LIMIT) {
    throw new Error("threads: caption is " + [...text].length + " characters, over " + TEXT_LIMIT);
  }
  if (dryRun) return { platform: "threads", id: "(dry run, nothing published)" };
  if (!userId || !accessToken) {
    throw new Error("threads: THREADS_USER_ID / THREADS_ACCESS_TOKEN not set");
  }
  if (!imageUrl) throw new Error("threads: no imageUrl provided");

  const creationId = await createContainer(userId, accessToken, imageUrl, text);
  // Meta fetches the image asynchronously; give it a moment before publishing.
  await sleep(3000);
  const id = await publishContainer(userId, accessToken, creationId);
  return { platform: "threads", id };
}

module.exports = { publish };
