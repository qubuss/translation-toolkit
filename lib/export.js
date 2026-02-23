/**
 * Export .po translation files to a single pipe-delimited CSV file.
 */

const fs = require('fs');
const { parsePo, discoverPoFiles, resolveTranslationsDir } = require('./poParser');

function escapeCsvField(value, delimiter) {
  if (
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes('\n')
  ) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

async function exportToCsv(outputPath, translationsDir, delimiter) {
  const poFiles = discoverPoFiles(translationsDir);

  if (poFiles.length === 0) {
    console.error('No .po files found in', translationsDir);
    process.exit(1);
  }

  // Sort by short code so column order is deterministic (en, pl, ...)
  poFiles.sort((a, b) => a.shortCode.localeCompare(b.shortCode));

  // Parse all files
  const allTranslations = new Map();
  const allPluralTranslations = new Map();
  const allKeys = new Set();
  const allPluralKeys = new Set();

  for (const poFile of poFiles) {
    const { entries, pluralEntries } = parsePo(poFile.filePath);
    allTranslations.set(poFile.shortCode, entries);
    allPluralTranslations.set(poFile.shortCode, pluralEntries);
    for (const key of entries.keys()) {
      allKeys.add(key);
    }
    for (const key of pluralEntries.keys()) {
      allPluralKeys.add(key);
    }
  }

  const languages = poFiles.map((f) => f.shortCode);
  const lines = [];

  // Header row
  lines.push(['key', ...languages].join(delimiter));

  // Singular data rows
  const sortedKeys = [...allKeys];

  for (const key of sortedKeys) {
    // Convert internal \x04 separator to :: for CSV display
    const csvKey = key.includes('\x04') ? key.replace('\x04', '::') : key;
    const row = [escapeCsvField(csvKey, delimiter)];
    for (const lang of languages) {
      const entries = allTranslations.get(lang);
      const value = entries ? entries.get(key) || '' : '';
      row.push(escapeCsvField(value, delimiter));
    }
    lines.push(row.join(delimiter));
  }

  // Plural data rows — each plural entry emits key[0], key[1], ..., key[N] rows
  const sortedPluralKeys = [...allPluralKeys];

  for (const key of sortedPluralKeys) {
    const csvKey = key.includes('\x04') ? key.replace('\x04', '::') : key;

    // Determine max form count across all languages
    let maxForms = 0;
    for (const lang of languages) {
      const pluralEntries = allPluralTranslations.get(lang);
      const entry = pluralEntries ? pluralEntries.get(key) : null;
      if (entry) maxForms = Math.max(maxForms, entry.msgstr.length);
    }

    // Emit key[N] rows
    for (let n = 0; n < maxForms; n++) {
      const row = [escapeCsvField(csvKey + '[' + n + ']', delimiter)];
      for (const lang of languages) {
        const pluralEntries = allPluralTranslations.get(lang);
        const entry = pluralEntries ? pluralEntries.get(key) : null;
        const value = entry && n < entry.msgstr.length ? entry.msgstr[n] : '';
        row.push(escapeCsvField(value, delimiter));
      }
      lines.push(row.join(delimiter));
    }
  }

  const csv = lines.join('\n') + '\n';

  fs.writeFileSync(outputPath, csv, 'utf-8');
  const totalKeys = sortedKeys.length + sortedPluralKeys.length;
  console.log(`Exported ${totalKeys} keys (${sortedPluralKeys.length} plural) × ${languages.length} languages → ${outputPath}`);
  console.log(`Languages: ${languages.join(', ')}`);
}

/**
 * Parse CLI args and run export.
 * @param {string[]} args
 */
async function runExport(args) {
  let outputPath = 'translations.csv';
  let dirArg;
  let delimiter = '|';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' || args[i] === '-o') {
      outputPath = args[i + 1];
      i++;
    } else if (args[i] === '--dir' || args[i] === '-d') {
      dirArg = args[i + 1];
      i++;
    } else if (args[i] === '--delimiter' || args[i] === '-D') {
      delimiter = args[i + 1];
      i++;
    }
  }

  const translationsDir = await resolveTranslationsDir(dirArg);
  await exportToCsv(outputPath, translationsDir, delimiter);
}

module.exports = { runExport, exportToCsv };
