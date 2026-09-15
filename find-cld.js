// find-cld.js  (READ-ONLY. Changes nothing. Just reports.)
//
// Finds every reference to CLD / Closed Loop Domains across a repo:
// all .json source files, content-calendar.json fields, and any file or
// folder name that mentions CLD.
//
// IMPORTANT: bare "closed-loop" is compliant KAELUM language and is NOT
// flagged. This only targets the CLD acronym and the phrase
// "closed loop domain(s)". Do not blanket find-and-replace "closed loop",
// or you will strip the compliant positioning out of every post.
//
// Usage:
//   node find-cld.js            scans the current folder
//   node find-cld.js <path>     scans a given repo root

const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || '.';

// What counts as a CLD reference. Bare "closed-loop" deliberately excluded.
const CLD_RE = /\bCLDs?\b|closed[\s-]?loop\s+domains?/i;

const results = [];
let filesScanned = 0;

function walkJson(node, keyPath, file) {
  if (typeof node === 'string') {
    if (CLD_RE.test(node)) {
      results.push({ file, keyPath: keyPath || '(root)', value: node });
    }
  } else if (Array.isArray(node)) {
    node.forEach((v, i) => walkJson(v, `${keyPath}[${i}]`, file));
  } else if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) {
      if (CLD_RE.test(k)) {
        results.push({ file, keyPath: keyPath ? `${keyPath}.${k}` : k, value: `(key name) ${k}` });
      }
      walkJson(node[k], keyPath ? `${keyPath}.${k}` : k, file);
    }
  }
}

function scanDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (CLD_RE.test(entry.name)) {
      results.push({ file: full, keyPath: entry.isDirectory() ? '(folder name)' : '(file name)', value: entry.name });
    }
    if (entry.isDirectory()) {
      scanDir(full);
    } else if (entry.name.endsWith('.json')) {
      filesScanned++;
      try {
        walkJson(JSON.parse(fs.readFileSync(full, 'utf8')), '', full);
      } catch (e) {
        console.error(`Could not parse ${full}: ${e.message}`);
      }
    }
  }
}

scanDir(ROOT);

console.log(`\nScanned ${filesScanned} JSON files under ${path.resolve(ROOT)}`);
console.log(`Found ${results.length} CLD reference(s):\n`);
for (const r of results) {
  const snippet = r.value.length > 200 ? r.value.slice(0, 197) + '...' : r.value;
  console.log(`- ${r.file}`);
  console.log(`    at:   ${r.keyPath}`);
  console.log(`    text: ${snippet}\n`);
}
if (results.length === 0) {
  console.log('No CLD references found. Nothing to remove.');
}
