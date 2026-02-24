/**
 * Export/Import .po translation files to/from flat JSON format.
 *
 * Each language produces a separate JSON file (e.g., en.json, pl.json).
 * Singular entries → string values; plural entries → arrays of strings.
 * Nested JSON is auto-flattened on import (dot-separated keys).
 *
 * Zero dependencies — pure Node.js stdlib.
 */

const fs = require('fs');
const path = require('path');
const { parsePo, patchPoFile, writePo, discoverPoFiles, resolveTranslationsDir } = require('./poParser');

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Convert internal key (with \x04 for msgctxt) to JSON-friendly key (with ::).
 * @param {string} key
 * @returns {string}
 */
function _internalKeyToJson(key) {
  return key.includes('\x04') ? key.replace('\x04', '::') : key;
}

/**
 * Convert JSON-friendly key (with ::) to internal key (with \x04).
 * @param {string} key
 * @returns {string}
 */
function _jsonKeyToInternal(key) {
  return key.includes('::') ? key.replace('::', '\x04') : key;
}

/**
 * Flatten a nested object into a flat object with dot-separated keys.
 * Arrays are preserved as values (for plurals).
 *
 * @param {object} obj - nested object
 * @param {string} [prefix=''] - current key prefix
 * @returns {object} flat object
 */
function _flattenObject(obj, prefix = '') {
  const result = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? prefix + '.' + key : key;

    if (Array.isArray(value)) {
      // Plural forms — keep as array
      result[fullKey] = value;
    } else if (typeof value === 'object' && value !== null) {
      // Nested object — recurse
      Object.assign(result, _flattenObject(value, fullKey));
    } else {
      // Scalar — convert to string
      result[fullKey] = String(value);
    }
  }

  return result;
}

/**
 * Detect whether a JSON object is nested (has object values that are not arrays).
 *
 * @param {object} obj
 * @returns {boolean}
 */
function _isNested(obj) {
  for (const value of Object.values(obj)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return true;
    }
  }
  return false;
}

// ── Well-known locale / plural mappings (mirrored from import.js) ───────

const LOCALE_MAP = {
  en: 'en-US', pl: 'pl-PL', cs: 'cs-CZ', sk: 'sk-SK',
  de: 'de-DE', fr: 'fr-FR', es: 'es-ES', it: 'it-IT',
  pt: 'pt-PT', nl: 'nl-NL', hu: 'hu-HU', ro: 'ro-RO',
  uk: 'uk-UA', ru: 'ru-RU',
};

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

// ── Export: .po → JSON ──────────────────────────────────────────────────

/**
 * Export .po translations to per-language flat JSON files.
 *
 * Each key becomes a JSON property. Singular → string, plural → string[].
 * Keys with msgctxt use :: separator (e.g., "menu::Save").
 *
 * @param {string} outputDir - directory to write JSON files into
 * @param {string} translationsDir - directory containing .po files
 * @param {object} [options] - export options
 * @param {boolean} [options.includeStatus=false] - include _status metadata key
 * @returns {void}
 */
function exportToJson(outputDir, translationsDir, options = {}) {
  const includeStatus = options.includeStatus === true;

  const poFiles = discoverPoFiles(translationsDir);

  if (poFiles.length === 0) {
    console.error('No .po files found in', translationsDir);
    process.exit(1);
  }

  poFiles.sort((a, b) => a.shortCode.localeCompare(b.shortCode));

  // Collect fuzzy keys across all languages (for _status)
  const allFuzzyKeys = new Map();
  if (includeStatus) {
    for (const poFile of poFiles) {
      const { fuzzyKeys } = parsePo(poFile.filePath);
      allFuzzyKeys.set(poFile.shortCode, fuzzyKeys);
    }
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const languages = poFiles.map((f) => f.shortCode);
  let totalKeys = 0;
  let totalPlural = 0;

  for (const poFile of poFiles) {
    const { entries, pluralEntries, fuzzyKeys } = parsePo(poFile.filePath);
    const json = {};

    // Singular entries
    for (const [key, value] of entries) {
      const jsonKey = _internalKeyToJson(key);
      json[jsonKey] = value;
    }

    // Plural entries → arrays
    for (const [key, entry] of pluralEntries) {
      const jsonKey = _internalKeyToJson(key);
      json[jsonKey] = [...entry.msgstr];
    }

    // Optional _status metadata (fuzzy info per key)
    if (includeStatus) {
      const statusObj = {};
      let hasFuzzy = false;
      for (const key of [...entries.keys(), ...pluralEntries.keys()]) {
        if (fuzzyKeys.has(key)) {
          statusObj[_internalKeyToJson(key)] = 'fuzzy';
          hasFuzzy = true;
        }
      }
      if (hasFuzzy) {
        json['_status'] = statusObj;
      }
    }

    const filePath = path.join(outputDir, poFile.shortCode + '.json');
    fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n', 'utf-8');

    if (totalKeys === 0) {
      totalKeys = entries.size + pluralEntries.size;
      totalPlural = pluralEntries.size;
    }
  }

  console.log(`Exported ${totalKeys} keys (${totalPlural} plural) × ${languages.length} languages → ${outputDir}/`);
  console.log(`Languages: ${languages.join(', ')}`);
  console.log(`Files: ${languages.map((l) => l + '.json').join(', ')}`);
}

// ── Import: JSON → .po ──────────────────────────────────────────────────

/**
 * Discover JSON translation files in a directory.
 * Matches *.json files, extracts short code from filename.
 *
 * @param {string} dir - directory containing JSON files
 * @returns {{ shortCode: string, filePath: string }[]}
 */
function discoverJsonFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files = fs.readdirSync(dir);
  const result = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    // Skip package.json, tsconfig.json, etc.
    if (file.startsWith('.') || file === 'package.json' || file === 'tsconfig.json') continue;

    const shortCode = file.replace('.json', '');
    // Validate: short code should be 2-5 lowercase alpha chars (en, pl, pt-BR → ptBR won't match, but we're lenient)
    if (!/^[a-z]{2,5}$/i.test(shortCode)) continue;

    result.push({
      shortCode: shortCode.toLowerCase(),
      filePath: path.join(dir, file),
    });
  }

  return result;
}

/**
 * Parse a JSON translation file into singular entries and plural entries.
 * Auto-flattens nested objects. Arrays are treated as plural forms.
 *
 * @param {string} filePath - path to JSON file
 * @returns {{ entries: Map<string, string>, pluralEntries: Map<string, { msgstr: string[] }> }}
 */
function parseJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error(`Invalid JSON in ${filePath}: ${e.message}`);
    process.exit(1);
  }

  // Remove _status metadata before flattening (it's an object, not a translation)
  delete data['_status'];

  // Auto-flatten nested objects
  const flat = _isNested(data) ? _flattenObject(data) : data;

  const entries = new Map();
  const pluralEntries = new Map();

  for (const [jsonKey, value] of Object.entries(flat)) {
    // Skip metadata keys
    if (jsonKey === '_status') continue;

    const internalKey = _jsonKeyToInternal(jsonKey);

    if (Array.isArray(value)) {
      // Plural entry
      pluralEntries.set(internalKey, {
        msgstr: value.map((v) => String(v)),
      });
    } else {
      // Singular entry
      entries.set(internalKey, String(value));
    }
  }

  return { entries, pluralEntries };
}

/**
 * Import JSON translation files back into .po files.
 *
 * @param {string} jsonDir - directory containing per-language JSON files
 * @param {boolean} mergeMode - if true, keep existing keys not in JSON
 * @param {string} translationsDir - directory containing .po files
 * @param {boolean} [dryRun=false] - if true, report changes without writing
 * @returns {void}
 */
function importFromJson(jsonDir, mergeMode, translationsDir, dryRun = false) {
  const jsonFiles = discoverJsonFiles(jsonDir);

  if (jsonFiles.length === 0) {
    console.error(`No JSON translation files found in ${jsonDir}`);
    process.exit(1);
  }

  console.log(`Found ${jsonFiles.length} JSON file(s): ${jsonFiles.map((f) => f.shortCode).join(', ')}`);

  // Discover existing .po files
  const existingPoFiles = discoverPoFiles(translationsDir);
  const shortCodeToPoFile = new Map();
  for (const poFile of existingPoFiles) {
    shortCodeToPoFile.set(poFile.shortCode, poFile);
  }

  let totalSingular = 0;
  let totalPlural = 0;

  for (const jsonFile of jsonFiles) {
    const { entries, pluralEntries } = parseJsonFile(jsonFile.filePath);

    totalSingular = Math.max(totalSingular, entries.size);
    totalPlural = Math.max(totalPlural, pluralEntries.size);

    const existingPoFile = shortCodeToPoFile.get(jsonFile.shortCode);

    // Build plural entries for patchPoFile: baseKey → { msgstr: [...] }
    const newPluralEntries = new Map();
    for (const [key, entry] of pluralEntries) {
      newPluralEntries.set(key, { msgstr: entry.msgstr });
    }

    if (existingPoFile) {
      if (dryRun) {
        const parsed = parsePo(existingPoFile.filePath);
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
        console.log(`  Would update: ${existingPoFile.filePath} (${finalEntries.size} keys: +${added} added, ~${changed} changed, -${removed} removed, ~${pluralChanged} plural forms changed)`);
      } else {
        patchPoFile(existingPoFile.filePath, entries, !mergeMode, newPluralEntries);
        console.log(`  Updated: ${existingPoFile.filePath} (${entries.size} singular + ${newPluralEntries.size} plural keys)`);
      }
    } else {
      // Create new .po file
      const locale = LOCALE_MAP[jsonFile.shortCode] || `${jsonFile.shortCode}-${jsonFile.shortCode.toUpperCase()}`;
      const filePath = path.join(translationsDir, `${locale}.po`);
      const defaultPluralForms = PLURAL_FORMS_MAP[jsonFile.shortCode] || 'nplurals=2; plural=(n != 1)';

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

  console.log(`Parsed ${totalSingular} singular + ${totalPlural} plural translation keys.`);
  console.log(dryRun ? 'Dry run complete. No files were modified.' : 'Import complete.');
}

// ── Exports ─────────────────────────────────────────────────────────────

module.exports = {
  exportToJson,
  importFromJson,
  parseJsonFile,
  discoverJsonFiles,
  _flattenObject,
  _isNested,
  _internalKeyToJson,
  _jsonKeyToInternal,
};
