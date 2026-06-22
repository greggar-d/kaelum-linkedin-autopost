// fix-calendar.js
// One-pass repair of content-calendar.json image paths.
//
// 1. yeah-i-said-it : filename uses "kaelum-yeah-said-it" (no -i-), folder keeps -i-
// 2. ai-board       : filename uses "kaelum-aiboard-directors", folder keeps full name
// 3. kaelum-users   : phantom kaelum-usersN files remapped to real
//                     creators/customers/merchants 1-6 based on the alt prefix
//                     ("For creators" / "For customers" / "For merchants"),
//                     assigned sequentially within each type and cycled 1-6.
//
// Run:  node fix-calendar.js
// It writes the file back in place and prints a change log.

const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "content-calendar.json");

function detectType(alt) {
  const a = (alt || "").toLowerCase();
  if (a.includes("for merchants")) return "merchants";
  if (a.includes("for creators")) return "creators";
  if (a.includes("for customers")) return "customers";
  return null;
}

function main() {
  const rows = JSON.parse(fs.readFileSync(FILE, "utf8"));

  const changes = [];
  const unmappedUsers = [];

  // Per-type counters so we cycle creators1..6, customers1..6, merchants1..6
  const counters = { creators: 0, customers: 0, merchants: 0 };

  rows.forEach((row, i) => {
    if (!row || typeof row.image !== "string") return;
    const before = row.image;

    // Work out the directory prefix from the existing path
    // (images/kaelum/... or images/personal/...), preserving it.
    const prefixMatch = before.match(/^(images\/(?:kaelum|personal))\//);
    const prefix = prefixMatch ? prefixMatch[1] : "images/kaelum";

    if (row._folder === "kaelum-yeah-i-said-it") {
      // Folder keeps -i-, filename drops it.
      const file = (row._source_filename || "").replace(
        "kaelum-yeah-i-said-it",
        "kaelum-yeah-said-it"
      );
      row.image = `${prefix}/kaelum-yeah-i-said-it/${file}`;
    } else if (row._folder === "kaelum-ai-board-of-directors") {
      // Folder keeps full name, filename collapses to kaelum-aiboard-directors.
      const file = (row._source_filename || "").replace(
        "kaelum-ai-board-of-directors",
        "kaelum-aiboard-directors"
      );
      row.image = `${prefix}/kaelum-ai-board-of-directors/${file}`;
    } else if (row._folder === "kaelum-users") {
      const type = detectType(row.alt);
      if (!type) {
        unmappedUsers.push({ index: i, alt: row.alt });
        return; // leave untouched, report it
      }
      counters[type] = (counters[type] % 6) + 1; // 1..6 cycling
      const n = counters[type];
      row.image = `${prefix}/kaelum-users/kaelum-${type}${n}.png`;
    } else {
      return; // other folders untouched
    }

    if (row.image !== before) {
      changes.push({ index: i, before, after: row.image });
    }
  });

  fs.writeFileSync(FILE, JSON.stringify(rows, null, 2) + "\n", "utf8");

  console.log("");
  console.log("Calendar repair complete");
  console.log("========================");
  console.log(`Rows changed : ${changes.length}`);
  console.log("");
  changes.forEach(({ index, before, after }) => {
    console.log(`  row ${index}`);
    console.log(`    - ${before}`);
    console.log(`    + ${after}`);
  });

  if (unmappedUsers.length > 0) {
    console.log("");
    console.log("WARNING: users rows with no detectable type (left untouched):");
    unmappedUsers.forEach(({ index, alt }) => {
      console.log(`  row ${index} | alt: ${alt}`);
    });
  }
  console.log("");
  console.log("Now run: node verify-images.js");
}

main();