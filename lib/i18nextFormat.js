/**
 * Export/Import .po translation files to/from i18next JSON format.
 *
 * Supports both i18next v4 (CLDR plural suffixes: _zero, _one, _two, _few, _many, _other)
 * and v3 (compatibilityJSON v3: no suffix / _plural, or _0/_1/_2 for nplurals>2).
 *
 * Each language produces a separate JSON file (e.g., en.json, pl.json).
 * Singular entries → string values; plural entries → suffixed keys.
 * Nested output via dot-separated keys is NOT used (flat keys, like jsonFormat.js).
 *
 * Zero dependencies — pure Node.js stdlib.
 */

const fs = require('fs');
const path = require('path');
const { parsePo, patchPoFile, writePo, discoverPoFiles, resolveTranslationsDir } = require('./poParser');

// ── Constants ───────────────────────────────────────────────────────────

/**
 * CLDR plural categories in canonical order.
 * Not every language uses all six — the mapping below defines which indices apply.
 */
const CLDR_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'];

/**
 * Mapping: language short code → array of CLDR category names.
 * Index in the array ≡ gettext msgstr[N] index.
 *
 * Sources: Unicode CLDR + gettext Plural-Forms header.
 *
 * For nplurals=2 (most Western European):
 *   msgstr[0] → one (singular), msgstr[1] → other (plural)
 *
 * For nplurals=3 (Slavic languages like Polish, Russian, Ukrainian):
 *   msgstr[0] → one, msgstr[1] → few, msgstr[2] → many
 *
 * For nplurals=3 (Czech, Slovak — different pattern):
 *   msgstr[0] → one, msgstr[1] → few, msgstr[2] → other
 *
 * For nplurals=3 (Romanian):
 *   msgstr[0] → one, msgstr[1] → few, msgstr[2] → other
 *
 * For nplurals=6 (Arabic):
 *   msgstr[0] → zero, msgstr[1] → one, msgstr[2] → two,
 *   msgstr[3] → few, msgstr[4] → many, msgstr[5] → other
 */
const GETTEXT_TO_CLDR = {
  // nplurals=2 (singular/plural)
  en: ['one', 'other'],
  de: ['one', 'other'],
  es: ['one', 'other'],
  fr: ['one', 'other'],
  it: ['one', 'other'],
  pt: ['one', 'other'],
  nl: ['one', 'other'],
  hu: ['one', 'other'],
  // nplurals=3 (Slavic: one/few/many)
  pl: ['one', 'few', 'many'],
  ru: ['one', 'few', 'many'],
  uk: ['one', 'few', 'many'],
  // nplurals=3 (Czech/Slovak: one/few/other)
  cs: ['one', 'few', 'other'],
  sk: ['one', 'few', 'other'],
  // nplurals=3 (Romanian: one/few/other)
  ro: ['one', 'few', 'other'],
  // nplurals=6 (Arabic)
  ar: ['zero', 'one', 'two', 'few', 'many', 'other'],
};

/**
 * Default CLDR mapping for unknown languages — assumes nplurals=2.
 */
const DEFAULT_CLDR = ['one', 'other'];

/**
 * Well-known locale mappings (mirrors import.js).
 */
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

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Convert internal key (with \x04 for msgctxt) to i18next-friendly key (with ::).
 * @param {string} key
 * @returns {string}
 */
function _internalKeyToI18next(key) {
  return key.includes('\x04') ? key.replace('\x04', '::') : key;
}

/**
 * Convert i18next-friendly key (with ::) to internal key (with \x04).
 * @param {string} key
 * @returns {string}
 */
function _i18nextKeyToInternal(key) {
  return key.includes('::') ? key.replace('::', '\x04') : key;
}

/**
 * Get CLDR category array for a language short code.
 * @param {string} shortCode - e.g., 'en', 'pl', 'de'
 * @returns {string[]} CLDR categories indexed by gettext form index
 */
function _getCLDRCategories(shortCode) {
  return GETTEXT_TO_CLDR[shortCode] || DEFAULT_CLDR;
}

/**
 * Regex to detect i18next v4 plural suffixes at end of key.
 * Matches: _zero, _one, _two, _few, _many, _other
 */
const I18NEXT_PLURAL_RE = /^(.+)_(zero|one|two|few|many|other)$/;

/**
 * Regex to detect i18next v3 plural suffixes at end of key.
 * Matches: _plural, _0, _1, _2, _3, _4, _5
 */
const I18NEXT_V3_PLURAL_RE = /^(.+?)(?:_plural|_(\d+))$/;

// ── Export: .po → i18next JSON ──────────────────────────────────────────

/**
 * Export .po translations to per-language i18next JSON files.
 *
 * Singular entries → plain string values.
 * Plural entries → suffixed keys (v4: _one/_other/..., v3: base/_plural or _0/_1/_2).
 *
 * @param {string} outputDir - directory to write JSON files into
 * @param {string} translationsDir - directory containing .po files
 * @param {object} [options] - export options
 * @param {number} [options.compatibilityJSON=4] - i18next version: 4 (CLDR) or 3 (legacy)
 * @returns {void}
 */
function exportToI18next(outputDir, translationsDir, options = {}) {
  const compat = options.compatibilityJSON || 4;

  const poFiles = discoverPoFiles(translationsDir);

  if (poFiles.length === 0) {
    console.error('No .po files found in', translationsDir);
    process.exit(1);
  }

  poFiles.sort((a, b) => a.shortCode.localeCompare(b.shortCode));

  fs.mkdirSync(outputDir, { recursive: true });

  const languages = poFiles.map((f) => f.shortCode);
  let totalKeys = 0;
  let totalPlural = 0;

  for (const poFile of poFiles) {
    const { entries, pluralEntries } = parsePo(poFile.filePath);
    const json = {};

    // Singular entries → plain string
    for (const [key, value] of entries) {
      const jsonKey = _internalKeyToI18next(key);
      json[jsonKey] = value;
    }

    // Plural entries → suffixed keys
    for (const [key, entry] of pluralEntries) {
      const jsonKey = _internalKeyToI18next(key);

      if (compat === 3) {
        // v3: nplurals=2 → base + base_plural; nplurals>2 → base_0, base_1, ...
        if (entry.msgstr.length <= 2) {
          json[jsonKey] = entry.msgstr[0] || '';
          if (entry.msgstr.length > 1) {
            json[jsonKey + '_plural'] = entry.msgstr[1];
          }
        } else {
          for (let n = 0; n < entry.msgstr.length; n++) {
            json[jsonKey + '_' + n] = entry.msgstr[n] || '';
          }
        }
      } else {
        // v4: CLDR suffixes
        const categories = _getCLDRCategories(poFile.shortCode);

        for (let n = 0; n < entry.msgstr.length; n++) {
          const suffix = n < categories.length ? categories[n] : 'other';
          json[jsonKey + '_' + suffix] = entry.msgstr[n] || '';
        }
      }
    }

    const filePath = path.join(outputDir, poFile.shortCode + '.json');
    fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n', 'utf-8');

    if (totalKeys === 0) {
      totalKeys = entries.size + pluralEntries.size;
      totalPlural = pluralEntries.size;
    }
  }

  const compatLabel = compat === 3 ? 'v3' : 'v4 (CLDR)';
  console.log(`Exported ${totalKeys} keys (${totalPlural} plural) × ${languages.length} languages → ${outputDir}/ [i18next ${compatLabel}]`);
  console.log(`Languages: ${languages.join(', ')}`);
  console.log(`Files: ${languages.map((l) => l + '.json').join(', ')}`);
}

// ── Import: i18next JSON → .po ──────────────────────────────────────────

/**
 * Discover i18next JSON translation files in a directory.
 * Same logic as jsonFormat.js — matches *.json, extracts short code from filename.
 *
 * @param {string} dir - directory containing JSON files
 * @returns {{ shortCode: string, filePath: string }[]}
 */
function discoverI18nextFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files = fs.readdirSync(dir);
  const result = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    if (file.startsWith('.') || file === 'package.json' || file === 'tsconfig.json') continue;

    const shortCode = file.replace('.json', '');
    if (!/^[a-z]{2,5}$/i.test(shortCode)) continue;

    result.push({
      shortCode: shortCode.toLowerCase(),
      filePath: path.join(dir, file),
    });
  }

  return result;
}

/**
 * Parse an i18next JSON file into singular entries and plural entries.
 *
 * Detects plural keys by suffix pattern and groups them back into
 * multi-form entries.
 *
 * @param {string} filePath - path to JSON file
 * @param {string} shortCode - language short code (for CLDR mapping on import)
 * @param {number} [compatibilityJSON=4] - i18next version: 4 (CLDR) or 3 (legacy)
 * @returns {{ entries: Map<string, string>, pluralEntries: Map<string, { msgstr: string[] }> }}
 */
function parseI18nextFile(filePath, shortCode, compatibilityJSON = 4) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error(`Invalid JSON in ${filePath}: ${e.message}`);
    process.exit(1);
  }

  const entries = new Map();
  const pluralEntries = new Map();

  if (compatibilityJSON === 3) {
    // v3: detect _plural suffix and _N suffixes
    // First pass: identify plural base keys
    const pluralBaseKeys = new Set();

    for (const jsonKey of Object.keys(data)) {
      const matchPlural = jsonKey.match(I18NEXT_V3_PLURAL_RE);
      if (matchPlural) {
        pluralBaseKeys.add(matchPlural[1]);
      }
    }

    // Second pass: build entries
    for (const [jsonKey, value] of Object.entries(data)) {
      const internalKey = _i18nextKeyToInternal(jsonKey);

      // Check if this is a plural base key (has companions like _plural or _0, _1, ...)
      if (pluralBaseKeys.has(jsonKey)) {
        // This is a base key — handled below
        continue;
      }

      const matchPlural = jsonKey.match(I18NEXT_V3_PLURAL_RE);
      if (matchPlural) {
        // This is a plural suffix key — skip, handled in base key processing
        continue;
      }

      // Singular entry
      entries.set(internalKey, String(value));
    }

    // Third pass: build plural entries from base keys
    for (const baseKey of pluralBaseKeys) {
      const internalKey = _i18nextKeyToInternal(baseKey);

      // Try _0, _1, _2, ... pattern first (nplurals > 2)
      const numericForms = [];
      let n = 0;
      while (data[baseKey + '_' + n] !== undefined) {
        numericForms.push(String(data[baseKey + '_' + n]));
        n++;
      }

      if (numericForms.length > 0) {
        pluralEntries.set(internalKey, { msgstr: numericForms });
      } else {
        // base + _plural pattern (nplurals = 2)
        const msgstr = [String(data[baseKey] || '')];
        if (data[baseKey + '_plural'] !== undefined) {
          msgstr.push(String(data[baseKey + '_plural']));
        }
        pluralEntries.set(internalKey, { msgstr });
      }
    }
  } else {
    // v4: detect CLDR suffixes
    const categories = _getCLDRCategories(shortCode);
    const categorySet = new Set(CLDR_CATEGORIES);

    // First pass: identify plural base keys
    const pluralBaseKeys = new Set();

    for (const jsonKey of Object.keys(data)) {
      const match = jsonKey.match(I18NEXT_PLURAL_RE);
      if (match) {
        pluralBaseKeys.add(match[1]);
      }
    }

    // Second pass: build entries
    for (const [jsonKey, value] of Object.entries(data)) {
      const match = jsonKey.match(I18NEXT_PLURAL_RE);

      if (match && pluralBaseKeys.has(match[1])) {
        // Plural suffix key — skip, handled in plural processing below
        continue;
      }

      if (pluralBaseKeys.has(jsonKey)) {
        // This jsonKey is a base key that also has CLDR-suffixed companions
        // Shouldn't normally happen in v4, but skip to avoid duplication
        continue;
      }

      // Singular entry
      const internalKey = _i18nextKeyToInternal(jsonKey);
      entries.set(internalKey, String(value));
    }

    // Third pass: build plural entries from suffix keys
    for (const baseKey of pluralBaseKeys) {
      const internalKey = _i18nextKeyToInternal(baseKey);

      // Collect forms in gettext index order using the language's CLDR mapping
      const msgstr = [];
      for (let idx = 0; idx < categories.length; idx++) {
        const suffix = categories[idx];
        const val = data[baseKey + '_' + suffix];
        msgstr.push(val !== undefined ? String(val) : '');
      }

      // Also check for extra categories not in the language's mapping
      // (e.g., if someone manually added _zero to English)
      for (const cat of CLDR_CATEGORIES) {
        if (!categories.includes(cat) && data[baseKey + '_' + cat] !== undefined) {
          // Extra category — append at end (best effort)
          msgstr.push(String(data[baseKey + '_' + cat]));
        }
      }

      pluralEntries.set(internalKey, { msgstr });
    }
  }

  return { entries, pluralEntries };
}

/**
 * Import i18next JSON translation files back into .po files.
 *
 * @param {string} jsonDir - directory containing per-language i18next JSON files
 * @param {boolean} mergeMode - if true, keep existing keys not in JSON
 * @param {string} translationsDir - directory containing .po files
 * @param {boolean} [dryRun=false] - if true, report changes without writing
 * @param {number} [compatibilityJSON=4] - i18next version: 4 (CLDR) or 3 (legacy)
 * @returns {void}
 */
function importFromI18next(jsonDir, mergeMode, translationsDir, dryRun = false, compatibilityJSON = 4) {
  const jsonFiles = discoverI18nextFiles(jsonDir);

  if (jsonFiles.length === 0) {
    console.error(`No i18next JSON translation files found in ${jsonDir}`);
    process.exit(1);
  }

  const compatLabel = compatibilityJSON === 3 ? 'v3' : 'v4 (CLDR)';
  console.log(`Found ${jsonFiles.length} i18next JSON file(s): ${jsonFiles.map((f) => f.shortCode).join(', ')} [${compatLabel}]`);

  // Discover existing .po files
  const existingPoFiles = discoverPoFiles(translationsDir);
  const shortCodeToPoFile = new Map();
  for (const poFile of existingPoFiles) {
    shortCodeToPoFile.set(poFile.shortCode, poFile);
  }

  let totalSingular = 0;
  let totalPlural = 0;

  for (const jsonFile of jsonFiles) {
    const { entries, pluralEntries } = parseI18nextFile(jsonFile.filePath, jsonFile.shortCode, compatibilityJSON);

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
  exportToI18next,
  importFromI18next,
  parseI18nextFile,
  discoverI18nextFiles,
  _internalKeyToI18next,
  _i18nextKeyToInternal,
  _getCLDRCategories,
  GETTEXT_TO_CLDR,
  DEFAULT_CLDR,
  CLDR_CATEGORIES,
  I18NEXT_PLURAL_RE,
  I18NEXT_V3_PLURAL_RE,
};
