/**
 * Generate translation coverage statistics.
 *
 * Provides per-language breakdown:
 * - Total keys vs translated keys
 * - % coverage
 * - Empty translations count
 * - Top missing keys
 */

const { parsePo, extractMeta, discoverPoFiles, resolveTranslationsDir } = require('./poParser');

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

// ── Core statistics ─────────────────────────────────────────────────────

/**
 * @typedef {Object} LangStats
 * @property {string} lang            - language short code
 * @property {number} totalKeys       - total key count in this language file
 * @property {number} translatedKeys  - keys with non-empty msgstr
 * @property {number} emptyKeys       - keys with empty msgstr
 * @property {number} missingKeys     - keys present in ref but absent in this lang
 * @property {number} extraKeys       - keys present in this lang but absent in ref
 * @property {number} coverage        - percentage 0-100
 * @property {string[]} topMissing    - first N missing key names
 * @property {number} pluralKeys      - total plural entries in this language
 * @property {number} pluralForms     - total plural forms count across all plural entries
 * @property {number} emptyPluralForms - plural forms with empty msgstr
 * @property {number} fuzzyKeys       - entries with #, fuzzy flag
 */

/**
 * @typedef {Object} StatsResult
 * @property {string} refLang           - reference language code
 * @property {number} refKeyCount       - total keys in reference language
 * @property {string[]} languages       - all language codes
 * @property {LangStats[]} langStats    - per-language stats
 * @property {number} overallCoverage   - average coverage across non-ref languages
 */

/**
 * Compute translation statistics for all .po files in a directory.
 *
 * @param {string} translationsDir
 * @param {number} [topMissingCount=10] - how many missing keys to include
 * @returns {StatsResult}
 */
function computeStats(translationsDir, topMissingCount = 10) {
  const poFiles = discoverPoFiles(translationsDir);

  if (poFiles.length === 0) {
    return {
      refLang: '',
      refKeyCount: 0,
      languages: [],
      langStats: [],
      overallCoverage: 0,
    };
  }

  poFiles.sort((a, b) => a.shortCode.localeCompare(b.shortCode));

  // Parse all languages
  /** @type {Map<string, Map<string, string>>} */
  const allTranslations = new Map();
  /** @type {Map<string, Map<string, import('./poParser').PluralEntry>>} */
  const allPluralTranslations = new Map();
  /** @type {Map<string, Set<string>>} */
  const allFuzzyKeys = new Map();

  for (const poFile of poFiles) {
    const { entries, pluralEntries, fuzzyKeys } = parsePo(poFile.filePath);
    allTranslations.set(poFile.shortCode, entries);
    allPluralTranslations.set(poFile.shortCode, pluralEntries);
    allFuzzyKeys.set(poFile.shortCode, fuzzyKeys || new Set());
  }

  // Determine reference language (most keys)
  let refLang = '';
  let maxKeys = 0;
  for (const [lang, entries] of allTranslations) {
    if (entries.size > maxKeys) {
      maxKeys = entries.size;
      refLang = lang;
    }
  }

  const refEntries = allTranslations.get(refLang);
  const refKeyCount = refEntries.size;
  const languages = poFiles.map((f) => f.shortCode);
  const langStats = [];

  for (const [lang, entries] of allTranslations) {
    const totalKeys = entries.size;
    let translatedKeys = 0;
    let emptyKeys = 0;

    for (const [, value] of entries) {
      if (value && value.trim() !== '') {
        translatedKeys++;
      } else {
        emptyKeys++;
      }
    }

    // Missing keys (in ref but not in this lang)
    const missing = [];
    for (const [key] of refEntries) {
      if (!entries.has(key)) {
        missing.push(key);
      }
    }

    // Extra keys (in this lang but not in ref)
    let extraKeys = 0;
    for (const [key] of entries) {
      if (!refEntries.has(key)) {
        extraKeys++;
      }
    }

    // Coverage = (translated keys that also exist in ref) / refKeyCount
    // For ref language: translatedKeys / totalKeys
    let coverage;
    if (lang === refLang) {
      coverage = totalKeys > 0 ? (translatedKeys / totalKeys) * 100 : 100;
    } else {
      const translatedFromRef = [...refEntries.keys()].filter(
        (key) => entries.has(key) && entries.get(key) && entries.get(key).trim() !== ''
      ).length;
      coverage = refKeyCount > 0 ? (translatedFromRef / refKeyCount) * 100 : 100;
    }

    // Plural entry stats
    const pluralEntries = allPluralTranslations.get(lang) || new Map();
    const pluralKeys = pluralEntries.size;
    let pluralForms = 0;
    let emptyPluralForms = 0;
    for (const [, entry] of pluralEntries) {
      pluralForms += entry.msgstr.length;
      for (const form of entry.msgstr) {
        if (form === '') emptyPluralForms++;
      }
    }

    // Fuzzy entry count
    const fuzzyKeysSet = allFuzzyKeys.get(lang) || new Set();
    const fuzzyKeysCount = fuzzyKeysSet.size;

    langStats.push({
      lang,
      totalKeys,
      translatedKeys,
      emptyKeys,
      missingKeys: missing.length,
      extraKeys,
      coverage: Math.round(coverage * 10) / 10,
      topMissing: missing.slice(0, topMissingCount),
      pluralKeys,
      pluralForms,
      emptyPluralForms,
      fuzzyKeys: fuzzyKeysCount,
    });
  }

  // Sort: reference language first, then by coverage ascending (worst first)
  langStats.sort((a, b) => {
    if (a.lang === refLang) return -1;
    if (b.lang === refLang) return 1;
    return a.coverage - b.coverage;
  });

  // Overall coverage (average of non-ref languages)
  const nonRefStats = langStats.filter((s) => s.lang !== refLang);
  const overallCoverage =
    nonRefStats.length > 0
      ? Math.round(
          (nonRefStats.reduce((sum, s) => sum + s.coverage, 0) / nonRefStats.length) * 10
        ) / 10
      : 100;

  return { refLang, refKeyCount, languages, langStats, overallCoverage };
}

// ── Terminal reporter ───────────────────────────────────────────────────

/**
 * Format a progress bar string for terminal output.
 *
 * @param {number} percent - 0–100
 * @param {number} [width=30] - character width of the bar
 * @returns {string}
 */
function progressBar(percent, width = 30) {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);

  let color;
  if (percent >= 90) color = C.green;
  else if (percent >= 60) color = C.yellow;
  else color = C.red;

  return `${color}${bar}${C.reset} ${percent}%`;
}

/**
 * Print statistics report to terminal with colours.
 *
 * @param {StatsResult} result
 */
function printStats(result) {
  const { refLang, refKeyCount, langStats, overallCoverage } = result;

  console.log();
  console.log(`${C.bold}translation-toolkit stats${C.reset}`);
  const refPluralCount = langStats.find((s) => s.lang === refLang)?.pluralKeys || 0;
  const pluralInfo = refPluralCount ? ` + ${refPluralCount} plural` : '';
  console.log(`${C.dim}Reference language: ${refLang} (${refKeyCount} keys${pluralInfo})${C.reset}`);
  console.log();

  // Per-language table
  for (const stat of langStats) {
    const isRef = stat.lang === refLang;
    const langLabel = `${C.bold}${C.cyan}${stat.lang.toUpperCase()}${C.reset}`;
    const refTag = isRef ? ` ${C.dim}(reference)${C.reset}` : '';

    console.log(`  ${langLabel}${refTag}`);
    console.log(`    Coverage:    ${progressBar(stat.coverage)}`);
    console.log(
      `    Translated:  ${C.green}${stat.translatedKeys}${C.reset} / ${refKeyCount}  ` +
        `${C.dim}(empty: ${stat.emptyKeys}, missing: ${stat.missingKeys}, extra: ${stat.extraKeys})${C.reset}`
    );

    if (stat.pluralKeys > 0) {
      console.log(
        `    Plurals:     ${C.green}${stat.pluralKeys}${C.reset} entries (${stat.pluralForms} forms` +
          (stat.emptyPluralForms > 0
            ? `, ${C.yellow}${stat.emptyPluralForms} empty${C.reset})`
            : ')')
      );
    }

    if (stat.fuzzyKeys > 0) {
      console.log(
        `    Fuzzy:       ${C.yellow}${stat.fuzzyKeys}${C.reset} entries need review`
      );
    }

    if (!isRef && stat.topMissing.length > 0) {
      console.log(`    Top missing:`);
      for (const key of stat.topMissing.slice(0, 5)) {
        const displayKey = key.replace('\x04', '::');
        console.log(`      ${C.dim}→${C.reset} ${C.magenta}${displayKey}${C.reset}`);
      }
      if (stat.missingKeys > 5) {
        console.log(`      ${C.dim}… and ${stat.missingKeys - 5} more${C.reset}`);
      }
    }
    console.log();
  }

  // Overall summary
  console.log(`${C.bold}Overall coverage:${C.reset} ${progressBar(overallCoverage)}`);
  console.log();
}

// ── CLI runner ──────────────────────────────────────────────────────────

/**
 * Parse CLI args and run stats.
 * @param {string[]} args
 */
async function runStats(args) {
  let dirArg;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' || args[i] === '-d') {
      dirArg = args[i + 1];
      i++;
    }
  }

  const translationsDir = await resolveTranslationsDir(dirArg);
  const result = computeStats(translationsDir);
  printStats(result);
}

module.exports = { computeStats, runStats };
