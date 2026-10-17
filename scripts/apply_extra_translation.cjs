// Translate only verified literal spans. JavaScript offsets use UTF-16.
const fs = require('node:fs');
const path = require('node:path');
const [manifestPath, translationsPath, baselineRoot, targetRoot] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const translations = JSON.parse(fs.readFileSync(translationsPath, 'utf8'));
const groups = Object.groupBy(manifest, entry => entry.file);
const outputs = [];
for (const [file, entries] of Object.entries(groups)) {
  let source = fs.readFileSync(path.join(baselineRoot, file), 'utf8');
  for (const entry of entries.sort((a, b) => b.start - a.start)) {
    const literal = source.slice(entry.start, entry.end);
    if (![JSON.stringify(entry.value), `'${entry.value}'`].includes(literal)) {
      throw new Error(`Unexpected source span in ${file}: ${entry.start}, ${literal}`);
    }
    const replacement = translations[entry.value];
    if (typeof replacement !== 'string') throw new Error(`Missing translation: ${entry.value}`);
    source = source.slice(0, entry.start) + JSON.stringify(replacement) + source.slice(entry.end);
  }
  outputs.push([path.join(targetRoot, file), source]);
}
for (const [file, source] of outputs) fs.writeFileSync(file, source);
process.stdout.write(`Translated ${manifest.length} verified literals in ${outputs.length} files.\n`);
