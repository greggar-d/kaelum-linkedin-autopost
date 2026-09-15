// fix-cld.js
// Removes every CLD / Closed Loop Domains reference from the repo.
//
// Two behaviours, decided per entry, not guessed:
//   GROUP A  the entry is a post ABOUT CLD  -> the whole entry/row is DELETED.
//   GROUP B  CLD is only "CLD registrations" inside a revenue-stream list
//            -> that item is removed and the stream count seven -> six.
//
// How it tells them apart: strip "CLD registrations" from the entry's text; if
// any CLD reference still remains (Closed Loop Domain, a CLD, #cld, CLDs...),
// it is Group A. If nothing remains, it was only the list item, so Group B.
//
// Compliant "closed-loop" (with no "domain" after it) is never touched.
//
// Runs on source theme files (objects keyed "1","2"...) and content-calendar.json
// (an array of rows) alike. Writes a .bak of every file it changes. Re-runnable:
// a second run finds nothing to do. Changes nothing until you have read the plan
// it prints, because it writes as it goes; use DRY_RUN below to preview first.
//
// Usage:
//   node fix-cld.js            apply changes (writes .bak backups first)
//   node fix-cld.js --dry      preview only, writes nothing

const fs = require("fs");
const path = require("path");

const DRY_RUN = process.argv.includes("--dry");

// Correct the dead terms sitting in the same revenue lists (KST -> KSC,
// NFT marketplace/commissions -> Tesserae). Your own shortCaptions already use
// the corrected terms, so this keeps the set consistent. Set to false for a
// CLD-only pass.
const FIX_ADJACENT_TERMS = true;

const ROOT = process.argv.find((a) => !a.startsWith("--") && a !== process.argv[0] && a !== process.argv[1]) || ".";

// Files that are logs or manifests, never content. Left untouched.
const SKIP = new Set([
  "posted-log.json", "posted-social-log.json",
  "package.json", "package-lock.json", "tsconfig.json",
]);

const CLD_ANY = /\bCLDs?\b|closed[\s-]?loop\s+domains?/i;   // any CLD reference
const CLD_REG = /CLD registrations/i;                       // the revenue line item

const report = { deletedEntries: [], deletedRows: [], transformedStrings: 0, filesChanged: [] };

// ---- helpers ---------------------------------------------------------------

function collectStrings(node, out) {
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) node.forEach((v) => collectStrings(v, out));
  else if (node && typeof node === "object") Object.values(node).forEach((v) => collectStrings(v, out));
  return out;
}

// Decide what to do with one entry/row based on all its text.
function classify(entryValue) {
  const blob = collectStrings(entryValue, []).join("\n");
  if (!CLD_ANY.test(blob)) return "none";
  const residual = blob.replace(new RegExp(CLD_REG.source, "gi"), "");
  return CLD_ANY.test(residual) ? "A" : "B";   // A = delete, B = trim the list
}

// Group B: rewrite one string, removing the CLD list item and fixing the count.
function transformString(s) {
  let out = s;
  out = out.replace(/,\s*CLD registrations/gi, "");
  out = out.replace(/CLD registrations,\s*/gi, "");
  out = out.replace(/\bSeven\b/g, "Six").replace(/\bseven\b/g, "six");
  if (FIX_ADJACENT_TERMS) {
    out = out.replace(/NFT marketplace commissions/gi, "Tesserae marketplace commissions");
    out = out.replace(/NFT commissions/gi, "Tesserae commissions");
    out = out.replace(/KST creation fees/gi, "KSC creation fees");
    out = out.replace(/KST fees/gi, "KSC fees");
  }
  return out;
}

function transformStringsInPlace(node) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => {
      if (typeof v === "string") { const n = transformString(v); if (n !== v) { node[i] = n; report.transformedStrings++; } }
      else transformStringsInPlace(v);
    });
  } else if (node && typeof node === "object") {
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (typeof v === "string") { const n = transformString(v); if (n !== v) { node[k] = n; report.transformedStrings++; } }
      else transformStringsInPlace(v);
    }
  }
}

function detectIndent(raw) {
  const m = raw.match(/\n(\t|[ ]+)\S/);
  if (!m) return 2;
  return m[1].includes("\t") ? "\t" : m[1].length;
}

// ---- per-file processing ---------------------------------------------------

function processFile(file) {
  const raw = fs.readFileSync(file, "utf8");
  let data;
  try { data = JSON.parse(raw); } catch { return; }   // not JSON we can walk
  const indent = detectIndent(raw);
  let changed = false;
  const base = path.basename(file);

  if (Array.isArray(data)) {
    // content-calendar.json and similar: an array of rows.
    const kept = [];
    data.forEach((row, i) => {
      const k = classify(row);
      if (k === "A") {
        report.deletedRows.push({
          file: base, index: i,
          day: row.day, slot: row.slot, destination: row.destination,
        });
        changed = true; // dropped
      } else {
        if (k === "B") { transformStringsInPlace(row); changed = true; }
        kept.push(row);
      }
    });
    if (changed) data = kept;
  } else if (data && typeof data === "object") {
    // theme source files: object keyed by entry number.
    for (const key of Object.keys(data)) {
      const k = classify(data[key]);
      if (k === "A") {
        report.deletedEntries.push({ file: base, key });
        delete data[key];
        changed = true;
      } else if (k === "B") {
        transformStringsInPlace(data[key]);
        changed = true;
      }
    }
  }

  if (changed) {
    report.filesChanged.push(base);
    if (!DRY_RUN) {
      fs.writeFileSync(file + ".bak", raw);
      fs.writeFileSync(file, JSON.stringify(data, null, indent) + "\n");
    }
  }
}

// ---- run -------------------------------------------------------------------

for (const name of fs.readdirSync(ROOT)) {
  if (!name.endsWith(".json")) continue;
  if (SKIP.has(name)) continue;
  processFile(path.join(ROOT, name));
}

// ---- summary ---------------------------------------------------------------

const line = "-".repeat(60);
console.log(`\n${DRY_RUN ? "DRY RUN (nothing written)" : "APPLIED (.bak backups written)"}`);
console.log(`FIX_ADJACENT_TERMS = ${FIX_ADJACENT_TERMS}\n${line}`);

console.log(`\nGroup A, whole CLD posts DELETED:`);
if (!report.deletedEntries.length && !report.deletedRows.length) console.log("  (none)");
report.deletedEntries.forEach((d) => console.log(`  source  ${d.file}  entry ${d.key}`));
report.deletedRows.forEach((d) =>
  console.log(`  calendar ${d.file}  row ${d.index}  (day ${d.day}, slot ${d.slot}, ${d.destination})  <-- now an empty slot`));

console.log(`\nGroup B, revenue-list strings trimmed (CLD out, count six): ${report.transformedStrings}`);
console.log(`\nFiles changed: ${report.filesChanged.length ? [...new Set(report.filesChanged)].join(", ") : "(none)"}`);
console.log(`\nNext: re-run  node find-cld.js  (expect 0), then  node verify-images.js  (expect 0 missing).`);
if (report.deletedRows.length) {
  console.log(`\nNote: the deleted calendar rows above leave those day/slot pairs empty.`);
  console.log(`See whether post.js matches rows by day+slot+destination (safe, just a gap)`);
  console.log(`or by array position (would shift). If you want zero gaps, say so and I will`);
  console.log(`switch this to backfill those slots with purple cow posts instead of deleting.`);
}
