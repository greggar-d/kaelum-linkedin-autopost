// add-purple-cow.js
// Wires the 30 purple cow posts into content-calendar.json.
//
// It reads the real image filenames off disk (images/<surface>/kaelum-purple-cow),
// so it does not matter what the files are called, it uses whatever is there,
// matched to purple-cow.json by the number in the filename.
//
// Each post: alt AND shortCaption = the headline (short, works on Threads/X/Bluesky),
// caption = the long v1/v2 line (LinkedIn), v1 on kaelum, v2 on personal.
//
// MODE:
//   "displace"  fill the 4 CLD gaps, then place the rest by retiring DISPLACE_THEME
//               rows spread across the 90 days. Volume stays 6/day.  [recommended]
//   "gaps"      fill only the 4 CLD gaps (uses 4 posts, leaves 26 unplaced).
//   "extend"    fill the 4 gaps, then append the rest as new days after day 90.
//
// Usage:
//   node add-purple-cow.js --dry     preview, writes nothing
//   node add-purple-cow.js           apply (writes content-calendar.json.bak first)

const fs = require("fs");
const path = require("path");

// ---- config ----------------------------------------------------------------
const MODE = "displace";                       // "displace" | "gaps" | "extend"
const SURFACES = ["kaelum", "personal"];       // surfaces purple cow may use
const DISPLACE_THEME = "kaelum-social-quote";  // which _folder gives way in displace mode
const PC_FOLDER = "kaelum-purple-cow";         // image subfolder name on both surfaces
const TOTAL_POSTS = 30;                         // one per image
// ----------------------------------------------------------------------------

const DRY = process.argv.includes("--dry");
const ROOT = ".";
const CAL = path.join(ROOT, "content-calendar.json");

function lastInt(s) { const m = String(s).match(/(\d+)(?!.*\d)/); return m ? parseInt(m[1], 10) : null; }

// real filenames on disk, per surface: { num -> filename }
function imagesFor(surface) {
  const dir = path.join(ROOT, "images", surface, PC_FOLDER);
  const map = {};
  if (!fs.existsSync(dir)) { console.error(`WARN: missing image folder ${dir}`); return map; }
  for (const f of fs.readdirSync(dir)) {
    if (!/\.(png|jpe?g|webp)$/i.test(f)) continue;
    const n = lastInt(f);
    if (n != null) map[n] = f;
  }
  return map;
}

const cal = JSON.parse(fs.readFileSync(CAL, "utf8"));
const raw = fs.readFileSync(CAL, "utf8");
const indent = (raw.match(/\n(\t|[ ]+)\S/) || [null, 2])[1];
const indentVal = indent === "\t" ? "\t" : (typeof indent === "string" ? indent.length : 2);
const pc = JSON.parse(fs.readFileSync(path.join(ROOT, "purple-cow.json"), "utf8"));
const img = { kaelum: imagesFor("kaelum"), personal: imagesFor("personal") };

const variantFor = (surface) => (surface === "personal" ? "v2" : "v1");
const variantNum = (surface) => (surface === "personal" ? 2 : 1);

// Build one calendar row for purple cow entry N on a given surface/slot/day.
function buildRow(n, surface, slot, day) {
  const entry = pc[String(n)];
  const file = img[surface][n];
  if (!entry || !file) { console.error(`WARN: no ${!entry ? "caption entry" : "image"} for purple cow ${n} on ${surface}, skipped`); return null; }
  const v = variantFor(surface);
  return {
    destination: surface,
    slot,
    day,
    image: `images/${surface}/${PC_FOLDER}/${file}`,
    alt: entry.quote,
    shortCaption: entry.quote,
    caption: entry[v].caption,
    hashtags: entry[v].hashtags,
    _folder: PC_FOLDER,
    _source_filename: file,
    _variant: variantNum(surface),
  };
}

// ---- find the gaps ----------------------------------------------------------
const maxDay = Math.max(...cal.map((r) => r.day));
const present = new Map(); // `${dest}|${slot}` -> Set(days)
for (const r of cal) {
  const k = `${r.destination}|${r.slot}`;
  if (!present.has(k)) present.set(k, new Set());
  present.get(k).add(r.day);
}
const slotsBy = new Map();
for (const r of cal) {
  if (!slotsBy.has(r.destination)) slotsBy.set(r.destination, new Set());
  slotsBy.get(r.destination).add(r.slot);
}
const gaps = [];
for (const [dest, slots] of slotsBy) {
  for (const slot of slots) {
    for (let d = 1; d <= maxDay; d++) {
      if (!present.get(`${dest}|${slot}`).has(d)) gaps.push({ destination: dest, slot, day: d });
    }
  }
}
gaps.sort((a, b) => a.day - b.day);

// ---- assign 30 posts --------------------------------------------------------
const placed = { gaps: [], displaced: [], extended: [] };
let next = 1; // next purple cow entry number

// 1) gaps first
const newRows = [];
for (const g of gaps) {
  if (next > TOTAL_POSTS) break;
  const row = buildRow(next, g.destination, g.slot, g.day);
  if (row) { newRows.push(row); placed.gaps.push({ n: next, ...g }); next++; }
}

// 2) the rest, per MODE
if (MODE === "displace") {
  const targets = cal
    .map((r, i) => ({ r, i }))
    .filter((x) => x.r._folder === DISPLACE_THEME && SURFACES.includes(x.r.destination))
    .sort((a, b) => a.r.day - b.r.day);
  const need = TOTAL_POSTS - (next - 1);
  if (targets.length < need) console.error(`WARN: only ${targets.length} ${DISPLACE_THEME} rows to displace, need ${need}`);
  const step = targets.length / need;
  const chosen = [];
  for (let k = 0; k < need && Math.floor(k * step) < targets.length; k++) chosen.push(targets[Math.floor(k * step)]);
  for (const t of chosen) {
    if (next > TOTAL_POSTS) break;
    const row = buildRow(next, t.r.destination, t.r.slot, t.r.day);
    if (row) {
      placed.displaced.push({ n: next, day: t.r.day, slot: t.r.slot, dest: t.r.destination, retired: t.r._source_filename });
      cal[t.i] = row; // overwrite in place, keeps day/slot/destination
      next++;
    }
  }
} else if (MODE === "extend") {
  let day = maxDay + 1, slotCursor = 0;
  const combos = [];
  for (const s of SURFACES) for (const slot of [1, 2, 3]) combos.push({ s, slot });
  while (next <= TOTAL_POSTS) {
    const c = combos[slotCursor % combos.length];
    const row = buildRow(next, c.s, c.slot, day);
    if (row) { newRows.push(row); placed.extended.push({ n: next, day, slot: c.slot, dest: c.s }); next++; }
    slotCursor++;
    if (slotCursor % combos.length === 0) day++;
  }
}

const finalCal = cal.concat(newRows);

// ---- write + report ---------------------------------------------------------
if (!DRY) {
  fs.writeFileSync(CAL + ".bak", raw);
  fs.writeFileSync(CAL, JSON.stringify(finalCal, null, indentVal) + "\n");
}

const line = "-".repeat(60);
console.log(`\n${DRY ? "DRY RUN (nothing written)" : "APPLIED (content-calendar.json.bak written)"}`);
console.log(`MODE = ${MODE}, SURFACES = ${SURFACES.join(", ")}\n${line}`);
console.log(`Gaps filled (${placed.gaps.length}):`);
placed.gaps.forEach((g) => console.log(`  purple cow ${g.n} -> ${g.destination} slot ${g.slot} day ${g.day}`));
if (placed.displaced.length) {
  console.log(`\nDisplaced (${placed.displaced.length}) ${DISPLACE_THEME} rows:`);
  placed.displaced.forEach((d) => console.log(`  purple cow ${d.n} -> ${d.dest} slot ${d.slot} day ${d.day}   (retired ${d.retired})`));
}
if (placed.extended.length) {
  console.log(`\nAppended (${placed.extended.length}) new rows after day ${maxDay}:`);
  placed.extended.forEach((e) => console.log(`  purple cow ${e.n} -> ${e.dest} slot ${e.slot} day ${e.day}`));
}
const usedNums = new Set([...placed.gaps, ...placed.displaced, ...placed.extended].map((x) => x.n));
const unplaced = [];
for (let i = 1; i <= TOTAL_POSTS; i++) if (!usedNums.has(i)) unplaced.push(i);
console.log(`\nTotal placed: ${usedNums.size} / ${TOTAL_POSTS}`);
if (unplaced.length) console.log(`Unplaced (mode "gaps" only fills 4): ${unplaced.join(", ")}`);
console.log(`Calendar rows: ${cal.length + newRows.length}`);
console.log(`\nNext: node verify-images.js (expect 0 missing), node find-cld.js (expect 0), then commit.`);
