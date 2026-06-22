// verify-images.js
// Checks the `image` field on every row in content-calendar.json,
// resolving each path the exact same way post.js does:
//   fs.readFileSync(path.join(__dirname, post.image))
//
// Usage:  node verify-images.js
// Exit 0 = every referenced image exists. Exit 1 = one or more missing.

const fs = require("fs");
const path = require("path");

const CALENDAR_FILE = path.join(__dirname, "content-calendar.json");

function main() {
  if (!fs.existsSync(CALENDAR_FILE)) {
    console.error(`Could not find ${CALENDAR_FILE}`);
    process.exit(1);
  }

  let rows;
  try {
    rows = JSON.parse(fs.readFileSync(CALENDAR_FILE, "utf8"));
  } catch (err) {
    console.error(`Failed to parse content-calendar.json: ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(rows)) {
    console.error("Expected content-calendar.json to be an array of rows.");
    process.exit(1);
  }

  const checked = [];
  const missing = [];
  const noImageField = [];

  rows.forEach((row, i) => {
    const imagePath = row && row.image;
    if (!imagePath || typeof imagePath !== "string") {
      // Row has no image field. Text-only slot, or a data problem worth knowing about.
      noImageField.push({
        index: i,
        destination: row && row.destination,
        slot: row && row.slot,
        day: row && row.day,
      });
      return;
    }

    checked.push(imagePath);
    const resolved = path.join(__dirname, imagePath);
    if (!fs.existsSync(resolved)) {
      missing.push({
        index: i,
        imagePath,
        destination: row.destination,
        slot: row.slot,
        day: row.day,
      });
    }
  });

  console.log("");
  console.log("KAELUM image calendar check");
  console.log("===========================");
  console.log(`Total rows                    : ${rows.length}`);
  console.log(`Rows with an image field      : ${checked.length}`);
  console.log(`Rows with NO image field      : ${noImageField.length}`);
  console.log(`Images found on disk          : ${checked.length - missing.length}`);
  console.log(`Images MISSING                : ${missing.length}`);
  console.log("");

  if (missing.length > 0) {
    console.log("MISSING IMAGES");
    console.log("--------------");
    missing
      .sort((a, b) => a.imagePath.localeCompare(b.imagePath))
      .forEach(({ imagePath, destination, slot, day, index }) => {
        console.log(`  ${imagePath}`);
        console.log(
          `      row ${index} | destination=${destination} slot=${slot} day=${day}`
        );
      });
    console.log("");
  }

  if (noImageField.length > 0) {
    console.log("ROWS WITH NO IMAGE FIELD (review these, may be intentional text-only)");
    console.log("---------------------------------------------------------------------");
    noImageField.forEach(({ index, destination, slot, day }) => {
      console.log(
        `  row ${index} | destination=${destination} slot=${slot} day=${day}`
      );
    });
    console.log("");
  }

  if (missing.length === 0) {
    console.log("All image-bearing rows resolve on disk. Schedule is safe to run.");
    process.exit(0);
  } else {
    console.log(
      `${missing.length} image(s) referenced in the calendar do not exist on disk.`
    );
    console.log("Fix those rows or add the files, then run again.");
    process.exit(1);
  }
}

main();