'use strict';

// Writes dist/SHA256SUMS-<platform>.txt for the installers in dist/, in the format
// `sha256sum -c` / `shasum -a 256 -c` understand. The builds are unsigned, so these
// checksums are how a user can confirm a download is the file the release job built.
//
//   node scripts/checksums.js

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist');
const EXTENSIONS = ['.AppImage', '.deb', '.exe', '.dmg'];

const files = fs
  .readdirSync(DIST)
  .filter((f) => EXTENSIONS.some((ext) => f.endsWith(ext)) && !f.includes('__uninstaller'))
  .sort();

if (!files.length) {
  console.error('No installers found in dist/');
  process.exit(1);
}

const lines = files.map((f) => {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(DIST, f))).digest('hex');
  return `${hash}  ${f}`;
});

const out = path.join(DIST, `SHA256SUMS-${process.platform}.txt`);
fs.writeFileSync(out, lines.join('\n') + '\n');
console.log(`${path.relative(process.cwd(), out)}\n${lines.join('\n')}`);
