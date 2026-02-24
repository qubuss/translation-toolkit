/**
 * Import a pipe-delimited CSV file back into .po translation files.
 */

const fs = require('fs');
const path = require('path');
const { parsePo, writePo, patchPoFile, discoverPoFiles, extractMeta, resolveTranslationsDir } = require('./poParser');
const { importFromJson } = require('./jsonFormat');
const { importFromI18next } = require('./i18nextFormat');

/**
 * Well-known short code → locale mappings for creating new .po files.
 */
const LOCALE_MAP = {
  en: 'en-US',
  pl: 'pl-PL',
  cs: 'cs-CZ',
  sk: 'sk-SK',
  de: 'de-DE',
  fr: 'fr-FR',
  es: 'es-ES',
  it: 'it-IT',
  pt: 'pt-PT',
  nl: 'nl-NL',
  hu: 'hu-HU',
  ro: 'ro-RO',
  uk: 'uk-UA',
  ru: 'ru-RU',
};

/**
 * Default Plural-Forms for new languages.
 */
const PLURAL_FORMS_MAP = {
  en: 'nplurals=2; plural=(n != 1)',
  pl: 'nplurals=3; plural=(n==1 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2)',
  cs: 'nplurals=3; plural=(n==1 ? 0 : (n>=2 && n<=4) ? 1 : 2)',
  sk: 'nplurals=3; plural=(n==1 ? 0 : (n>=2 && n<=4) ? 1 : 2)',
  de: 'nplurals=2; plural=(n != 1)',
  fr: 'nplurals=2; plural=(n > 1)',
  es: 'nplurals=2; plural=(n != 1)',
  it: 'nplurals=2; plural=(n != 1)',
  pt: 'nplurals=2; plural=(n != 1)',
  nl: 'nplurals=2; plural=(n != 1)',
  hu: 'nplurals=2; plural=(n != 1)',
  ro: 'nplurals=3; plural=(n==1 ? 0 : (n==0 || (n%100>0 && n%100<20)) ? 1 : 2)',
  uk: 'nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2)',
  ru: 'nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2)',
};

/**
 * Parse entire CSV content into an array of rows (arrays of field strings).
 * Correctly handles multi-line values inside quoted fields.
 *
 * @param {string} content - raw CSV file content
 * @param {string} delimiter - field delimiter
 * @returns {string[][]}
 */
function parseCsvContent(content, delimiter) {
  const rows = [];
  let current = '';
  let fields = [];
  let inQuotes = false;
  let i = 0;

  while (i < content.length) {
    const ch = content[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < content.length && content[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        current += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === delimiter) {
        fields.push(current);
        current = '';
        i++;
      } else if (ch === '\n') {
        fields.push(current);
        current = '';
        if (fields.some((f) => f.trim() !== '') || fields.length > 1) {
          rows.push(fields);
        }
        fields = [];
        i++;
      } else if (ch === '\r') {
        // Skip CR (handle \r\n)
        i++;
      } else {
        current += ch;
        i++;
      }
    }
  }

  // Flush last row
  fields.push(current);
  if (fields.some((f) => f.trim() !== '') || fields.length > 1) {
    rows.push(fields);
  }

  return rows;
}

async function importFromCsv(csvPath, mergeMode, translationsDir, delimiter, dryRun = false) {
  if (!fs.existsSync(csvPath)) {
    console.error(`File not found: ${csvPath}`);
    process.exit(1);
  }

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCsvContent(csvContent, delimiter);

  if (rows.length < 2) {
    console.error('CSV file must have at least a header row and one data row.');
    process.exit(1);
  }

  // Parse header — detect and skip _status column
  const headerFields = rows[0];
  if (headerFields[0] !== 'key') {
    console.error(`First column must be "key", got "${headerFields[0]}".`);
    process.exit(1);
  }

  // _status column is optional (added by export v1.6.0+) — skip it for language parsing
  const hasStatusColumn = headerFields[1] === '_status';
  const langStartIdx = hasStatusColumn ? 2 : 1;
  const statusColIdx = hasStatusColumn ? 1 : -1;
  const languages = headerFields.slice(langStartIdx);
  console.log(`Found ${languages.length} language(s) in CSV: ${languages.join(', ')}`);
  if (hasStatusColumn) {
    console.log('  (CSV includes _status column — fuzzy info detected)');
  }

  // Build entries per language — separate singular and plural forms
  const langEntries = new Map();
  const langPluralForms = new Map();
  for (const lang of languages) {
    langEntries.set(lang, new Map());
    langPluralForms.set(lang, new Map());
  }

  const PLURAL_KEY_RE = /^(.+)\[(\d+)\]$/;

  // Build fuzzy status changes from _status column
  // key → true (should be fuzzy) / false (should be unfuzzied)
  const fuzzyChanges = new Map();

  for (let i = 1; i < rows.length; i++) {
    const fields = rows[i];
    const csvKey = fields[0];

    if (!csvKey) {
      continue;
    }

    // Collect fuzzy status from _status column
    if (hasStatusColumn) {
      const status = (fields[statusColIdx] || '').trim().toLowerCase();
      const pluralMatch = csvKey.match(PLURAL_KEY_RE);
      const rawBaseKey = pluralMatch ? pluralMatch[1] : csvKey;
      const internalKey = rawBaseKey.includes('::') ? rawBaseKey.replace('::', '\x04') : rawBaseKey;

      if (status === 'fuzzy') {
        fuzzyChanges.set(internalKey, true);
      } else if (!fuzzyChanges.has(internalKey)) {
        // Only set to false if not already set to true (fuzzy from any row takes precedence)
        fuzzyChanges.set(internalKey, false);
      }
    }

    const pluralMatch = csvKey.match(PLURAL_KEY_RE);

    if (pluralMatch) {
      // Plural form row: key[N]
      const baseKey = pluralMatch[1];
      const formIdx = parseInt(pluralMatch[2], 10);
      const internalKey = baseKey.includes('::') ? baseKey.replace('::', '\x04') : baseKey;

      for (let j = 0; j < languages.length; j++) {
        const lang = languages[j];
        const value = fields[j + langStartIdx] || '';
        const forms = langPluralForms.get(lang);
        if (!forms.has(internalKey)) {
          forms.set(internalKey, new Map());
        }
        forms.get(internalKey).set(formIdx, value);
      }
    } else {
      // Singular entry
      const key = csvKey.includes('::') ? csvKey.replace('::', '\x04') : csvKey;
      for (let j = 0; j < languages.length; j++) {
        const value = fields[j + langStartIdx] || '';
        langEntries.get(languages[j]).set(key, value);
      }
    }
  }

  const singularCount = langEntries.get(languages[0]).size;
  const pluralCount = langPluralForms.get(languages[0]).size;
  const markedFuzzyCount = [...fuzzyChanges.values()].filter(v => v === true).length;
  const totalKeys = singularCount + pluralCount;
  const unfuzzyCount = totalKeys - markedFuzzyCount;
  let parsedMsg = `Parsed ${singularCount} singular + ${pluralCount} plural translation keys.`;
  if (hasStatusColumn && markedFuzzyCount > 0) {
    parsedMsg += ` Fuzzy status: ${markedFuzzyCount} marked fuzzy, ${unfuzzyCount} clean.`;
  }
  console.log(parsedMsg);

  if (dryRun) {
    console.log('\n  DRY RUN — no files will be modified.\n');
  }

  // Discover existing .po files
  const existingFiles = discoverPoFiles(translationsDir);
  const shortCodeToFile = new Map();
  for (const poFile of existingFiles) {
    shortCodeToFile.set(poFile.shortCode, poFile);
  }

  // Process each language
  for (const lang of languages) {
    const entries = langEntries.get(lang);
    const pluralForms = langPluralForms.get(lang);
    const existingFile = shortCodeToFile.get(lang);

    // Build plural entries for patchPoFile: baseKey → { msgstr: [...] }
    const newPluralEntries = new Map();
    for (const [baseKey, formsMap] of pluralForms) {
      const maxIdx = formsMap.size > 0 ? Math.max(...formsMap.keys()) : -1;
      const msgstr = [];
      for (let n = 0; n <= maxIdx; n++) {
        msgstr.push(formsMap.get(n) || '');
      }
      newPluralEntries.set(baseKey, { msgstr });
    }

    if (existingFile) {
      if (dryRun) {
        // Dry-run: parse and compare, report changes
        const parsed = parsePo(existingFile.filePath);
        const finalEntries = mergeMode ? new Map([...parsed.entries, ...entries]) : entries;
        let added = 0, changed = 0, removed = 0;
        for (const [key, value] of finalEntries) {
          if (!parsed.entries.has(key)) { added++; }
          else if (parsed.entries.get(key) !== value) { changed++; }
        }
        if (!mergeMode) {
          for (const key of parsed.entries.keys()) {
            if (!finalEntries.has(key)) { removed++; }
          }
        }
        let pluralChanged = 0;
        for (const [key, newPlural] of newPluralEntries) {
          const existingPlural = parsed.pluralEntries.get(key);
          if (existingPlural) {
            for (let n = 0; n < newPlural.msgstr.length; n++) {
              if (n < existingPlural.msgstr.length && existingPlural.msgstr[n] !== newPlural.msgstr[n]) {
                pluralChanged++;
              }
            }
          }
        }
        console.log(`  Would update: ${existingFile.filePath} (${finalEntries.size} keys: +${added} added, ~${changed} changed, -${removed} removed, ~${pluralChanged} plural forms changed)`);
      } else {
        // Patch in-place: preserves header, comments, blank lines, original formatting
        patchPoFile(existingFile.filePath, entries, !mergeMode, newPluralEntries, fuzzyChanges);
        console.log(`  Updated: ${existingFile.filePath} (${entries.size} singular + ${newPluralEntries.size} plural keys)`);
      }
    } else {
      const locale = LOCALE_MAP[lang] || `${lang}-${lang.toUpperCase()}`;
      const filePath = path.join(translationsDir, `${locale}.po`);
      const defaultPluralForms = PLURAL_FORMS_MAP[lang] || 'nplurals=2; plural=(n != 1)';

      if (dryRun) {
        console.log(`  Would create: ${filePath} (${entries.size} keys)`);
        if (newPluralEntries.size > 0) {
          console.log(`    Note: ${newPluralEntries.size} plural entries skipped for new file (patch-only).`);
        }
      } else {
        writePo(filePath, {
          language: locale,
          pluralForms: defaultPluralForms,
        }, entries);

        if (newPluralEntries.size > 0) {
          console.log(`  Created: ${filePath} (${entries.size} keys, ${newPluralEntries.size} plural entries skipped — patch-only)`);
        } else {
          console.log(`  Created: ${filePath} (${entries.size} keys)`);
        }
      }
    }
  }

  console.log(dryRun ? 'Dry run complete. No files were modified.' : 'Import complete.');
}

/**
 * Parse CLI args and run import.
 * @param {string[]} args
 */
async function runImport(args) {
  let csvPath;
  let mergeMode = false;
  let dryRun = false;
  let dirArg;
  let delimiter = '|';
  let format = 'csv';
  let compatJSON = 4;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--merge' || args[i] === '-m') {
      mergeMode = true;
    } else if (args[i] === '--dry-run' || args[i] === '-n') {
      dryRun = true;
    } else if (args[i] === '--dir' || args[i] === '-d') {
      dirArg = args[i + 1];
      i++;
    } else if (args[i] === '--delimiter' || args[i] === '-D') {
      delimiter = args[i + 1];
      i++;
    } else if (args[i] === '--format' || args[i] === '-f') {
      format = (args[i + 1] || '').toLowerCase();
      i++;
    } else if (args[i] === '--compat') {
      const val = parseInt(args[i + 1], 10);
      if (val === 3 || val === 4) compatJSON = val;
      i++;
    } else if (!args[i].startsWith('-')) {
      csvPath = args[i];
    }
  }

  if (format !== 'csv' && format !== 'json' && format !== 'i18next') {
    console.error(`Unknown format: "${format}". Supported formats: csv, json, i18next`);
    process.exit(1);
  }

  if (!csvPath) {
    if (format === 'json') {
      console.error('Usage: translation-toolkit import --format json <json-dir> [--merge] [--dir <po-dir>]');
    } else if (format === 'i18next') {
      console.error('Usage: translation-toolkit import --format i18next <json-dir> [--merge] [--dir <po-dir>] [--compat 3|4]');
    } else {
      console.error('Usage: translation-toolkit import <file.csv> [--merge] [--dir <path>]');
    }
    process.exit(1);
  }

  const translationsDir = await resolveTranslationsDir(dirArg);

  if (format === 'json') {
    importFromJson(csvPath, mergeMode, translationsDir, dryRun);
  } else if (format === 'i18next') {
    importFromI18next(csvPath, mergeMode, translationsDir, dryRun, compatJSON);
  } else {
    await importFromCsv(csvPath, mergeMode, translationsDir, delimiter, dryRun);
  }
}

module.exports = { runImport, importFromCsv, parseCsvContent };
