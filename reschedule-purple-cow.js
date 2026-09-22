// reschedule-purple-cow.js
// The 90-day campaign has ended (post-social.js guards day > 90). The 30 purple
// cow posts are stranded on past days (1-87) and can never fire. This lifts them
// off the dead days and re-places all 30 on the days still ahead, starting the
// day after today, both surfaces, 3 slots each. New day numbers are not in the
// dedup log, so they post. It does NOT touch START_DATE.
//
//   node reschedule-purple-cow.js --dry    preview
//   node reschedule-purple-cow.js          apply (.bak written)

const fs = require("fs");
const path = require("path");

const START_DATE = "2026-06-22";   // campaign day 1, same value the workflow passes
const PC_FOLDER = "kaelum-purple-cow";
const DRY = process.argv.includes("--dry");
const ROOT = ".";
const CAL = path.join(ROOT, "content-calendar.json");

function todayIndex() {
  const start = new Date(START_DATE + "T00:00:00Z");
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.floor((today - start) / 86400000) + 1;
}
function dateForDay(day) {
  const d = new Date(new Date(START_DATE + "T00:00:00Z").getTime() + (day - 1) * 86400000);
  return d.toISOString().slice(0, 10);
}
function lastInt(s) { const m = String(s).match(/(\d+)(?!.*\d)/); return m ? parseInt(m[1], 10) : null; }
function imagesFor(surface) {
  const dir = path.join(ROOT, "images", surface, PC_FOLDER);
  const map = {};
  if (!fs.existsSync(dir)) { console.error(`WARN: missing ${dir}`); return map; }
  for (const f of fs.readdirSync(dir)) { if (/\.(png|jpe?g|webp)$/i.test(f)) { const n = lastInt(f); if (n != null) map[n] = f; } }
  return map;
}

const raw = fs.readFileSync(CAL, "utf8");
const indent = (raw.match(/\n(\t|[ ]+)\S/) || [null, 2])[1];
const indentVal = indent === "\t" ? "\t" : (typeof indent === "string" ? indent.length : 2);
const cal = JSON.parse(raw);
const pc = JSON.parse(fs.readFileSync(path.join(ROOT, "purple-cow.json"), "utf8"));
const img = { kaelum: imagesFor("kaelum"), personal: imagesFor("personal") };

const vFor = (s) => (s === "personal" ? "v2" : "v1");
const vNum = (s) => (s === "personal" ? 2 : 1);
function buildRow(n, surface, slot, day) {
  const e = pc[String(n)], file = img[surface][n];
  if (!e || !file) { console.error(`WARN: missing ${!e ? "caption" : "image"} for purple cow ${n} on ${surface}`); return null; }
  const v = vFor(surface);
  return { destination: surface, slot, day,
    image: `images/${surface}/${PC_FOLDER}/${file}`,
    alt: e.quote, shortCaption: e.quote, caption: e[v].caption, hashtags: e[v].hashtags,
    _folder: PC_FOLDER, _source_filename: file, _variant: vNum(surface) };
}

// 1) remove the stranded purple cow rows
const before = cal.length;
const kept = cal.filter((r) => r._folder !== PC_FOLDER);
const removed = before - kept.length;

// 2) place 30 fresh on the days ahead: 6 per day (kaelum 1-3, personal 1-3)
const startDay = todayIndex() + 1;
const combos = [["kaelum",1],["kaelum",2],["kaelum",3],["personal",1],["personal",2],["personal",3]];
const placed = [];
let n = 1;
for (let i = 0; n <= 30; i++) {
  const [surface, slot] = combos[i % 6];
  const day = startDay + Math.floor(i / 6);
  const row = buildRow(n, surface, slot, day);
  if (row) { kept.push(row); placed.push({ n, surface, slot, day }); }
  n++;
}

if (!DRY) { fs.writeFileSync(CAL + ".bak", raw); fs.writeFileSync(CAL, JSON.stringify(kept, null, indentVal) + "\n"); }

const line = "-".repeat(64);
console.log(`\n${DRY ? "DRY RUN (nothing written)" : "APPLIED (.bak written)"}`);
console.log(`Today is campaign day ${todayIndex()} (${dateForDay(todayIndex())}). Placing from day ${startDay}.\n${line}`);
console.log(`Removed ${removed} stranded purple cow rows from past days.`);
console.log(`Placed 30 on days ${startDay} to ${startDay + 4}:`);
let d = null;
for (const p of placed) {
  if (p.day !== d) { d = p.day; console.log(`  day ${d} (${dateForDay(d)}):`); }
  console.log(`    purple cow ${p.n}  ${p.surface} slot ${p.slot}${p.surface === "kaelum" ? "   <- also X/Threads/Bluesky" : ""}`);
}
console.log(`\nCalendar rows: ${kept.length}`);
console.log(`\nNEXT: raise the day guard in post-social.js AND post.js from 90 to 120,`);
console.log(`then node verify-images.js (expect 0 missing), node find-cld.js, then commit.`);
