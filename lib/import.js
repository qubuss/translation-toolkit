/**
 * Import a pipe-delimited CSV file back into .po translation files.
 */

const fs = require('fs');
const path = require('path');
const { parsePo, writePo, discoverPoFiles, extractMeta, resolveTranslationsDir } = require('./poParser');

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

  // Parse header
  const headerFields = rows[0];
  if (headerFields[0] !== 'key') {
    console.error(`First column must be "key", got "${headerFields[0]}".`);
    process.exit(1);
  }

  const languages = headerFields.slice(1);
  console.log(`Found ${languages.length} language(s) in CSV: ${languages.join(', ')}`);

  // Build entries per language
  const langEntries = new Map();
  for (const lang of languages) {
    langEntries.set(lang, new Map());
  }

  for (let i = 1; i < rows.length; i++) {
    const fields = rows[i];
    const csvKey = fields[0];

    if (!csvKey) {
      continue;
    }

    // Convert :: in CSV key back to internal \x04 separator (msgctxt)
    const key = csvKey.includes('::') ? csvKey.replace('::', '\x04') : csvKey;

    for (let j = 0; j < languages.length; j++) {
      const value = fields[j + 1] || '';
      langEntries.get(languages[j]).set(key, value);
    }
  }

  const keyCount = langEntries.get(languages[0]).size;
  console.log(`Parsed ${keyCount} translation keys.`);

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
    const existingFile = shortCodeToFile.get(lang);

    if (existingFile) {
      const parsed = parsePo(existingFile.filePath);
      const meta = extractMeta(parsed.header);

      let finalEntries;
      if (mergeMode) {
        finalEntries = new Map(parsed.entries);
        for (const [key, value] of entries) {
          finalEntries.set(key, value);
        }
      } else {
        finalEntries = entries;
      }

      if (dryRun) {
        // Compare to find changes
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
        console.log(`  Would update: ${existingFile.filePath} (${finalEntries.size} keys: +${added} added, ~${changed} changed, -${removed} removed)`);
      } else {
        writePo(existingFile.filePath, {
          language: meta.language || existingFile.locale,
          pluralForms: meta.pluralForms,
        }, finalEntries);

        console.log(`  Updated: ${existingFile.filePath} (${finalEntries.size} keys)`);
      }
    } else {
      const locale = LOCALE_MAP[lang] || `${lang}-${lang.toUpperCase()}`;
      const filePath = path.join(translationsDir, `${locale}.po`);
      const pluralForms = PLURAL_FORMS_MAP[lang] || 'nplurals=2; plural=(n != 1)';

      if (dryRun) {
        console.log(`  Would create: ${filePath} (${entries.size} keys)`);
      } else {
        writePo(filePath, {
          language: locale,
          pluralForms,
        }, entries);

        console.log(`  Created: ${filePath} (${entries.size} keys)`);
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
    } else if (!args[i].startsWith('-')) {
      csvPath = args[i];
    }
  }

  if (!csvPath) {
    console.error('Usage: translation-toolkit import <file.csv> [--merge] [--dir <path>]');
    process.exit(1);
  }

  const translationsDir = await resolveTranslationsDir(dirArg);
  await importFromCsv(csvPath, mergeMode, translationsDir, delimiter, dryRun);
}

module.exports = { runImport, importFromCsv, parseCsvContent };
