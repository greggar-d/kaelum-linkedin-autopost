# KAELUM LinkedIn auto-post

> **Status: KAE relaunch calendar extended (27 October 2026).** 192 images per
> destination from six folders (kaelum-facts, kaelum-purple-cow,
> kaelum-social-quotes, kaelum-yeah-i-said-it, kaelum-waitlist,
> kaelum-banks-engagement), 64 days at 3 posts a day per destination. Only these
> six folders are in the rotation; other image folders are kept but not
> scheduled. The waitlist and banks-engagement cards are spread evenly from day 8,
> alternating, and the personal profile carries them on different days from the
> KAELUM Page. All captions use KAE and the current KAELUM wording rules. The
> first campaign's logs are archived in `logs/archive-2026-09/`. Posting starts
> on the `START_DATE` repository variable.

## Repo layout

```
post.js                      the posting engine (no dependencies)
content-calendar.json        every post: caption, hashtags, image, day, slot
posted-log.json              written automatically as posts go out
images/personal/             your 1080x1350 PNGs for the personal profile
images/kaelum/               your 1080x1350 PNGs for the KAELUM Page
.github/workflows/autopost.yml   the six daily schedules
```

## One-time setup

### 1. LinkedIn Developer App (start this first, it is the slow part)

1. Create an app at the LinkedIn Developer Portal, linked to the KAELUM
   company Page. You must be an admin of that Page.
2. Add two products: **Share on LinkedIn** and **Sign In with LinkedIn using
   OpenID Connect**. These need LinkedIn review, which can take a few days.
3. Scopes you will authorise: `w_member_social` (posts to your personal
   profile), `w_organization_social` (posts to the KAELUM Page), plus
   `openid` and `profile` to read your member id.

### 2. Get the two author URNs

- **Personal**: call `GET https://api.linkedin.com/v2/userinfo` with your token.
  The `sub` value is your member id. Your URN is `urn:li:person:<sub>`.
- **KAELUM Page**: the organisation id is in your Page admin URL. Your URN is
  `urn:li:organization:<id>`.

### 3. Get an access token

Run the OAuth flow once and capture the access token and refresh token. The
access token lasts 60 days, the refresh token 365 days. For a 90 day run you
will need to refresh the access token once around day 50 (see below).

### 4. Set GitHub secrets and variables

In **Settings > Secrets and variables > Actions**:

Secrets:
- `LINKEDIN_ACCESS_TOKEN`  token from KAELUM Page Poster app (Community Management API). Covers both your personal profile and the KAELUM Page.
- `LINKEDIN_PERSON_URN`  e.g. `urn:li:person:abcd1234`
- `LINKEDIN_ORG_URN`     e.g. `urn:li:organization:12345678`

Note: App 1 (KAELUM Social) is not used by this system. All posting runs through the
KAELUM Page Poster app once LinkedIn approves the Community Management API access request.

Variables:
- `START_DATE`  the first posting day, format `YYYY-MM-DD`. Day 1 of 90.

## The content calendar

`content-calendar.json` is a flat array. One object per post:

```json
{
  "destination": "personal",   // "personal" or "kaelum"
  "slot": 1,                    // 1, 2 or 3
  "day": 1,                     // 1 to 90
  "image": "images/personal/p-day01-slot1.png",
  "alt": "short image description",
  "caption": "Paragraph one.\n\nParagraph two.",
  "hashtags": "#kaelum #fintech #ai"
}
```

A full run is 540 objects (90 days x 3 slots x 2 destinations). I write these in
batches and you drop them straight in. The script joins caption and hashtags
with a blank line, so do not repeat the hashtags inside the caption.

**Image naming** matches the `image` path in each row. Suggested convention:
`p-dayNN-slotN.png` for personal, `k-dayNN-slotN.png` for KAELUM. Rename your
PNGs to match, or tell me your filenames and I will map the calendar to them.

If a day has no calendar entry yet, that slot simply skips with a log line.
Nothing breaks. You can load the calendar in batches as content is approved.

## Testing before you go live

Use the **Run workflow** button on the Actions tab (manual dispatch):
- `destination`: personal or kaelum
- `slot`: 1, 2 or 3
- `dry_run`: leave as `true`

A dry run prints the exact caption, image path and character count and
publishes nothing. Set `dry_run` to `false` for one real test post when you are
ready. Locally you can run the same check:

```
START_DATE=2026-06-17 DRY_RUN=true TRIGGER_CRON="0 8 * * *" node post.js
```

## Going live

Once secrets are set, the calendar is loaded and a real test post has worked,
do nothing. The six schedules fire on their own. Each scheduled run also commits
`posted-log.json`, which doubles as your audit trail and keeps the repo active
so GitHub does not pause the schedules.

## Token refresh

Simplest for a 90 day run: around day 50, run the OAuth refresh once and update
the `LINKEDIN_ACCESS_TOKEN` secret. Refresh call:

```
POST https://www.linkedin.com/oauth/v2/accessToken
  grant_type=refresh_token
  refresh_token=<your refresh token>
  client_id=<app id>
  client_secret=<app secret>
```

If you would rather automate it, I can add a second weekly workflow that
refreshes the token and rewrites the secret via the GitHub API. For a one-off
90 day campaign the single manual refresh is lower risk.

## Known limits (so nothing surprises you)

- **Schedule timing is best-effort.** GitHub can run a scheduled job a few
  minutes late under load. Acceptable for social posting; do not treat the
  times as to-the-second.
- **No native scheduling in LinkedIn's API.** This repo is the scheduler. That
  is by design.
- **Clock change.** A run started in summer stays in BST. If your window
  crosses the late-October change to GMT, shift the six crons forward one hour
  (e.g. `0 8` becomes `0 9`) from that date.
- **Rate limit** is roughly 100 calls per member per day. Six posts a day is
  nowhere near it.
- **No @mentions, no PDF carousels, no native scheduling** through the API.
  Single-image posts, which is what we are doing, are fully supported.
- **Cadence honesty.** Three posts a day on a single personal profile can split
  your own reach, because LinkedIn spaces distribution. The engine will run
  whatever you set; if reach on the personal profile dips, the first lever to
  pull is dropping personal to one strong post a day and keeping three on the
  Page.
