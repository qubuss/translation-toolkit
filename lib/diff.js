/**
 * Compare two CSV translation files and show differences.
 *
 * Supports two modes:
 *   - Two CSV files:  translation-toolkit diff old.csv new.csv
 *   - CSV vs current: translation-toolkit diff translations.csv  (compares with current .po files)
 *
 * Detects:
 *   - Added keys (in new, not in old)
 *   - Removed keys (in old, not in new)
 *   - Changed translations (same key, different value)
 */

const fs = require('fs');
const { parsePo, discoverPoFiles, resolveTranslationsDir } = require('./poParser');
const { parseCsvContent } = require('./import');

// ── Colours (ANSI) ──────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  magenta: '\x1b[35m',
};

// ── CSV parser ──────────────────────────────────────────────────────────

/**
 * Parse a CSV file into a structured object.
 * Handles multi-line values in quoted fields.
 *
 * @param {string} csvPath
 * @param {string} delimiter
 * @returns {{ languages: string[], rows: Map<string, Record<string, string>> }}
 */
function parseCsvFile(csvPath, delimiter) {
  const content = fs.readFileSync(csvPath, 'utf-8');
  const csvRows = parseCsvContent(content, delimiter);

  if (csvRows.length < 1) {
    return { languages: [], rows: new Map() };
  }

  const headerFields = csvRows[0];
  const languages = headerFields.slice(1); // skip 'key'

  const rows = new Map(); // key → { lang: value, ... }
  for (let i = 1; i < csvRows.length; i++) {
    const fields = csvRows[i];
    const key = fields[0];
    if (!key) continue;

    const translations = {};
    for (let j = 0; j < languages.length; j++) {
      translations[languages[j]] = fields[j + 1] || '';
    }
    rows.set(key, translations);
  }

  return { languages, rows };
}

/**
 * Build a "CSV-like" data structure from current .po files.
 *
 * @param {string} translationsDir
 * @returns {{ languages: string[], rows: Map<string, Record<string, string>> }}
 */
function loadPoAsCsv(translationsDir) {
  const poFiles = discoverPoFiles(translationsDir);
  poFiles.sort((a, b) => a.shortCode.localeCompare(b.shortCode));

  const languages = poFiles.map((f) => f.shortCode);
  const allKeys = new Set();
  const allTranslations = new Map();
  const allPluralKeys = new Set();
  const allPluralTranslations = new Map();

  for (const poFile of poFiles) {
    const { entries, pluralEntries } = parsePo(poFile.filePath);
    // Convert internal \x04 separator to :: to match CSV key format
    const normalised = new Map();
    for (const [k, v] of entries) {
      normalised.set(k.replace('\x04', '::'), v);
    }
    allTranslations.set(poFile.shortCode, normalised);
    for (const key of normalised.keys()) {
      allKeys.add(key);
    }
    if (pluralEntries) {
      allPluralTranslations.set(poFile.shortCode, pluralEntries);
      for (const key of pluralEntries.keys()) {
        allPluralKeys.add(key);
      }
    }
  }

  const rows = new Map();
  for (const key of allKeys) {
    const translations = {};
    for (const lang of languages) {
      const entries = allTranslations.get(lang);
      translations[lang] = entries ? entries.get(key) || '' : '';
    }
    rows.set(key, translations);
  }

  // Add plural entries as key[N] rows (matching CSV export format)
  for (const rawKey of allPluralKeys) {
    const displayKey = rawKey.includes('\x04') ? rawKey.replace('\x04', '::') : rawKey;
    let maxForms = 0;
    for (const lang of languages) {
      const pe = allPluralTranslations.get(lang);
      const entry = pe ? pe.get(rawKey) : null;
      if (entry) maxForms = Math.max(maxForms, entry.msgstr.length);
    }
    for (let n = 0; n < maxForms; n++) {
      const translations = {};
      for (const lang of languages) {
        const pe = allPluralTranslations.get(lang);
        const entry = pe ? pe.get(rawKey) : null;
        translations[lang] = entry && n < entry.msgstr.length ? entry.msgstr[n] : '';
      }
      rows.set(displayKey + '[' + n + ']', translations);
    }
  }

  return { languages, rows };
}

// ── Diff computation ────────────────────────────────────────────────────

/**
 * @typedef {'added' | 'removed' | 'changed'} DiffType
 *
 * @typedef {Object} DiffEntry
 * @property {DiffType} type
 * @property {string} key
 * @property {string} lang        - language code (for changed entries)
 * @property {string} [oldValue]  - previous value
 * @property {string} [newValue]  - new value
 */

/**
 * @typedef {Object} DiffResult
 * @property {DiffEntry[]} entries
 * @property {number} addedKeys     - count of fully new keys
 * @property {number} removedKeys   - count of fully removed keys
 * @property {number} changedValues - count of individual value changes
 * @property {string[]} oldLanguages
 * @property {string[]} newLanguages
 */

/**
 * Compare two translation datasets.
 *
 * @param {{ languages: string[], rows: Map<string, Record<string, string>> }} oldData
 * @param {{ languages: string[], rows: Map<string, Record<string, string>> }} newData
 * @returns {DiffResult}
 */
function computeDiff(oldData, newData) {
  const entries = [];
  let addedKeys = 0;
  let removedKeys = 0;
  let changedValues = 0;

  // All languages from both
  const allLangs = [...new Set([...oldData.languages, ...newData.languages])].sort();

  // Added keys (in new but not in old)
  for (const [key, newTranslations] of newData.rows) {
    if (!oldData.rows.has(key)) {
      addedKeys++;
      entries.push({
        type: 'added',
        key,
        lang: '',
        oldValue: '',
        newValue: allLangs.map((l) => newTranslations[l] || '').filter(Boolean).join(' | '),
      });
    }
  }

  // Removed keys (in old but not in new)
  for (const [key, oldTranslations] of oldData.rows) {
    if (!newData.rows.has(key)) {
      removedKeys++;
      entries.push({
        type: 'removed',
        key,
        lang: '',
        oldValue: allLangs.map((l) => oldTranslations[l] || '').filter(Boolean).join(' | '),
        newValue: '',
      });
    }
  }

  // Changed values (same key, different translation)
  for (const [key, oldTranslations] of oldData.rows) {
    if (!newData.rows.has(key)) continue;
    const newTranslations = newData.rows.get(key);

    for (const lang of allLangs) {
      const oldVal = oldTranslations[lang] || '';
      const newVal = newTranslations[lang] || '';

      if (oldVal !== newVal) {
        changedValues++;
        entries.push({
          type: 'changed',
          key,
          lang,
          oldValue: oldVal,
          newValue: newVal,
        });
      }
    }
  }

  // Sort: added first, then removed, then changed
  entries.sort((a, b) => {
    const order = { added: 0, removed: 1, changed: 2 };
    if (a.type !== b.type) return order[a.type] - order[b.type];
    if (a.key !== b.key) return a.key.localeCompare(b.key);
    return (a.lang || '').localeCompare(b.lang || '');
  });

  return {
    entries,
    addedKeys,
    removedKeys,
    changedValues,
    oldLanguages: oldData.languages,
    newLanguages: newData.languages,
  };
}

// ── Terminal reporter ───────────────────────────────────────────────────

/**
 * Print diff report to terminal with colours.
 *
 * @param {DiffResult} result
 * @param {string} oldLabel
 * @param {string} newLabel
 */
function printDiffReport(result, oldLabel, newLabel) {
  const { entries, addedKeys, removedKeys, changedValues } = result;

  console.log();
  console.log(`${C.bold}translation-toolkit diff${C.reset}`);
  console.log(`${C.dim}Old: ${oldLabel}${C.reset}`);
  console.log(`${C.dim}New: ${newLabel}${C.reset}`);
  console.log();

  if (entries.length === 0) {
    console.log(`${C.green}✓ No differences found.${C.reset}\n`);
    return;
  }

  // Group by type
  const added = entries.filter((e) => e.type === 'added');
  const removed = entries.filter((e) => e.type === 'removed');
  const changed = entries.filter((e) => e.type === 'changed');

  if (added.length > 0) {
    console.log(`${C.bold}${C.green}+ Added keys (${addedKeys})${C.reset}`);
    for (const entry of added) {
      console.log(`  ${C.green}+ ${entry.key}${C.reset}`);
      if (entry.newValue) {
        console.log(`    ${C.dim}${entry.newValue}${C.reset}`);
      }
    }
    console.log();
  }

  if (removed.length > 0) {
    console.log(`${C.bold}${C.red}- Removed keys (${removedKeys})${C.reset}`);
    for (const entry of removed) {
      console.log(`  ${C.red}- ${entry.key}${C.reset}`);
      if (entry.oldValue) {
        console.log(`    ${C.dim}${entry.oldValue}${C.reset}`);
      }
    }
    console.log();
  }

  if (changed.length > 0) {
    console.log(`${C.bold}${C.yellow}~ Changed values (${changedValues})${C.reset}`);
    for (const entry of changed) {
      const langTag = entry.lang ? `${C.cyan}[${entry.lang.toUpperCase()}]${C.reset} ` : '';
      console.log(`  ${C.yellow}~ ${langTag}${entry.key}${C.reset}`);
      console.log(`    ${C.red}- ${entry.oldValue || '(empty)'}${C.reset}`);
      console.log(`    ${C.green}+ ${entry.newValue || '(empty)'}${C.reset}`);
    }
    console.log();
  }

  // Summary
  console.log(
    `${C.bold}Summary:${C.reset} ` +
      `${C.green}+${addedKeys} added${C.reset}, ` +
      `${C.red}-${removedKeys} removed${C.reset}, ` +
      `${C.yellow}~${changedValues} changed${C.reset}\n`
  );
}

// ── CLI runner ──────────────────────────────────────────────────────────

/**
 * Parse CLI args and run diff.
 * @param {string[]} args
 */
async function runDiff(args) {
  let dirArg;
  let delimiter = '|';
  let exitZero = false;
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' || args[i] === '-d') {
      dirArg = args[i + 1];
      i++;
    } else if (args[i] === '--delimiter' || args[i] === '-D') {
      delimiter = args[i + 1];
      i++;
    } else if (args[i] === '--exit-zero') {
      exitZero = true;
    } else if (!args[i].startsWith('-')) {
      positional.push(args[i]);
    }
  }

  if (positional.length === 0) {
    console.error('Usage:\n  translation-toolkit diff <old.csv> <new.csv>    Compare two CSV files\n  translation-toolkit diff <file.csv>              Compare CSV with current .po files');
    process.exit(1);
  }

  let oldData, newData, oldLabel, newLabel;

  if (positional.length >= 2) {
    // Mode 1: two CSV files
    const [oldPath, newPath] = positional;
    if (!fs.existsSync(oldPath)) {
      console.error(`File not found: ${oldPath}`);
      process.exit(1);
    }
    if (!fs.existsSync(newPath)) {
      console.error(`File not found: ${newPath}`);
      process.exit(1);
    }

    oldData = parseCsvFile(oldPath, delimiter);
    newData = parseCsvFile(newPath, delimiter);
    oldLabel = oldPath;
    newLabel = newPath;
  } else {
    // Mode 2: CSV vs current .po files
    const csvPath = positional[0];
    if (!fs.existsSync(csvPath)) {
      console.error(`File not found: ${csvPath}`);
      process.exit(1);
    }

    const translationsDir = await resolveTranslationsDir(dirArg);
    oldData = parseCsvFile(csvPath, delimiter);
    newData = loadPoAsCsv(translationsDir);
    oldLabel = csvPath;
    newLabel = `current .po files (${translationsDir})`;
  }

  const result = computeDiff(oldData, newData);
  printDiffReport(result, oldLabel, newLabel);

  // Exit with code 1 if there are differences (useful for CI)
  if (result.entries.length > 0 && !exitZero) {
    process.exit(1);
  }
}

module.exports = { computeDiff, parseCsvFile, loadPoAsCsv, runDiff };
