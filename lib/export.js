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
  const allKeys = new Set();

  for (const poFile of poFiles) {
    const { entries } = parsePo(poFile.filePath);
    allTranslations.set(poFile.shortCode, entries);
    for (const key of entries.keys()) {
      allKeys.add(key);
    }
  }

  const languages = poFiles.map((f) => f.shortCode);
  const lines = [];

  // Header row
  lines.push(['key', ...languages].join(delimiter));

  // Data rows
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

  const csv = lines.join('\n') + '\n';

  fs.writeFileSync(outputPath, csv, 'utf-8');
  console.log(`Exported ${sortedKeys.length} keys × ${languages.length} languages → ${outputPath}`);
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
