#!/usr/bin/env node
/**
 * Weekly Threads token check (runs from .github/workflows/threads-token-check.yml)
 * -------------------------------------------------------------------------------
 * Threads long-lived access tokens last 60 days. When one expires, every Threads
 * post fails quietly while Bluesky and X carry on. This check catches it early.
 *
 * Every run:
 *   1. Confirms THREADS_ACCESS_TOKEN still works (GET /me).
 *   2. Counts Threads failures in posted-social-log.json over the last 7 days.
 *   3. If the token works AND a SECRETS_PAT secret is present, renews the token
 *      (Threads refresh endpoint, another 60 days) and hands the new value to
 *      the workflow, which saves it back into THREADS_ACCESS_TOKEN.
 *
 * Results go to GITHUB_OUTPUT for the workflow:
 *   status   = ok | renewed | invalid | missing | failing
 *   summary  = one plain-English line for the issue / job summary
 *   new_token is written only when renewal succeeded, and is masked in logs.
 *
 * The token itself is never printed. Node 18+ (global fetch). No dependencies.
 */
const fs = require("fs");
const path = require("path");

const GRAPH = "https://graph.threads.net";
const token = (process.env.THREADS_ACCESS_TOKEN || "").trim();
const canSave = !!(process.env.SECRETS_PAT || "").trim();

function output(key, value) {
  const file = process.env.GITHUB_OUTPUT;
  const line = `${key}<<__EOF__\n${value}\n__EOF__\n`;
  if (file) fs.appendFileSync(file, line);
  else if (key !== "new_token") console.log(`[output] ${key}=${value}`);
}

function recentThreadsFailures(days = 7) {
  try {
    const log = JSON.parse(fs.readFileSync(path.join(__dirname, "posted-social-log.json"), "utf8"));
    const since = Date.now() - days * 86400000;
    const recent = log.filter((e) => e.platform === "threads" && new Date(e.at).getTime() > since);
    const failed = recent.filter((e) => e.status === "failed");
    // Token errors are covered by the live check above; only other failures matter once the token works.
    const otherFailed = failed.filter((e) => !/access token|OAuthException|"code":190/i.test(e.error || "")).length;
    return { failed: failed.length, otherFailed, total: recent.length };
  } catch (_) {
    return { failed: 0, otherFailed: 0, total: 0 };
  }
}

async function getJson(url) {
  const res = await fetch(url);
  let body = {};
  try { body = await res.json(); } catch (_) { /* empty body */ }
  return { ok: res.ok, status: res.status, body };
}

async function main() {
  const fails = recentThreadsFailures();
  const failNote = fails.total ? ` Threads posts in the last 7 days: ${fails.total - fails.failed} posted, ${fails.failed} failed.` : "";

  if (!token) {
    output("status", "missing");
    output("summary", "THREADS_ACCESS_TOKEN is not set, so nothing can post to Threads." + failNote);
    return;
  }

  // 1. Does the token still work?
  const me = await getJson(`${GRAPH}/v1.0/me?fields=id,username&access_token=${encodeURIComponent(token)}`);
  if (!me.ok || !me.body.id) {
    const reason = (me.body && me.body.error && me.body.error.message) || `HTTP ${me.status}`;
    output("status", "invalid");
    output("summary", `The Threads access token no longer works (${reason.replace(/access_token=\S+/g, "access_token=***")}). Generate a new one and update THREADS_ACCESS_TOKEN.` + failNote);
    return;
  }
  const who = me.body.username ? `@${me.body.username}` : `account ${me.body.id}`;

  // 2. Renew, if the workflow can save the new token.
  if (canSave) {
    const r = await getJson(`${GRAPH}/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(token)}`);
    if (r.ok && r.body.access_token) {
      const days = r.body.expires_in ? Math.round(r.body.expires_in / 86400) : 60;
      if (process.env.GITHUB_ACTIONS) console.log(`::add-mask::${r.body.access_token}`);
      output("new_token", r.body.access_token);
      output("status", "renewed");
      output("summary", `Threads token for ${who} works and was renewed. It is now valid for about ${days} days.` + failNote);
      return;
    }
    // A token under 24 hours old cannot be refreshed yet; that is fine.
    const reason = (r.body && r.body.error && r.body.error.message) || `HTTP ${r.status}`;
    console.log(`Renewal skipped: ${reason.replace(/access_token=\S+/g, "access_token=***")}`);
  }

  // 3. Token works. Still flag recent failures, which point to a different problem.
  if (fails.otherFailed >= 3) {
    output("status", "failing");
    output("summary", `The Threads token for ${who} works, but several recent Threads posts failed for another reason. Check the error messages in posted-social-log.json.` + failNote);
    return;
  }

  output("status", "ok");
  output("summary", `Threads token for ${who} works.` +
    (canSave ? "" : " It was not renewed automatically because SECRETS_PAT is not set, so it will still expire 60 days after it was generated.") + failNote);
}

main().catch((e) => {
  output("status", "invalid");
  output("summary", `The Threads token check could not complete: ${String(e && e.message || e).replace(/access_token=\S+/g, "access_token=***")}`);
});
