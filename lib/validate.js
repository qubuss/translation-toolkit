/**
 * Validate translation files for common issues:
 * - Missing keys (present in reference language, absent in target)
 * - Extra keys (present in target, absent in reference language)
 * - Empty translations (msgstr is empty string)
 * - Inconsistent variables ({{var}} mismatch between languages)
 */

const fs = require('fs');
const path = require('path');
const { parsePo, extractMeta, discoverPoFiles, resolveTranslationsDir } = require('./poParser');
const { parseJsonFile, discoverJsonFiles, _internalKeyToJson } = require('./jsonFormat');
const { parseI18nextFile, discoverI18nextFiles } = require('./i18nextFormat');

// ── Colours (ANSI) ──────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Extract all {{variable}} placeholders from a string.
 * @param {string} text
 * @returns {string[]} sorted list of variable names
 */
function extractVariables(text) {
  const matches = text.match(/\{\{(\w+)\}\}/g);
  if (!matches) {
    return [];
  }
  return [...new Set(matches)].sort();
}

/**
 * Extract nplurals count from Plural-Forms header string.
 * e.g. "nplurals=3; plural=(n==1 ? 0 : ...)" → 3
 * @param {string|undefined} pluralForms
 * @returns {number|undefined}
 */
function _parseNplurals(pluralForms) {
  if (!pluralForms) return undefined;
  const m = pluralForms.match(/nplurals\s*=\s*(\d+)/);
  return m ? parseInt(m[1], 10) : undefined;
}

// ── Core validation ─────────────────────────────────────────────────────

/**
 * @typedef {'error' | 'warning'} Severity
 *
 * @typedef {Object} ValidationIssue
 * @property {Severity} severity
 * @property {string} type      - issue type id (missing-key, extra-key, empty-translation, variable-mismatch)
 * @property {string} lang      - language short code
 * @property {string} key       - translation key
 * @property {string} message   - human-readable description
 */

/**
 * Run validation on all .po files in a directory.
 *
 * The reference language is the one with the most keys (typically "en").
 *
 * @param {string} translationsDir
 * @returns {{ issues: ValidationIssue[], refLang: string, languages: string[], totalKeys: number }}
 */
function validateTranslations(translationsDir) {
  const poFiles = discoverPoFiles(translationsDir);

  if (poFiles.length === 0) {
    return { issues: [], refLang: '', languages: [], totalKeys: 0 };
  }

  poFiles.sort((a, b) => a.shortCode.localeCompare(b.shortCode));

  // Parse all languages
  /** @type {Map<string, Map<string, string>>} */
  const allTranslations = new Map();
  /** @type {Map<string, Map<string, import('./poParser').PluralEntry>>} */
  const allPluralTranslations = new Map();
  /** @type {Map<string, number|undefined>} */
  const langNplurals = new Map();
  /** @type {Map<string, Set<string>>} */
  const allFuzzyKeys = new Map();

  for (const poFile of poFiles) {
    const { entries, pluralEntries, header, fuzzyKeys } = parsePo(poFile.filePath);
    allTranslations.set(poFile.shortCode, entries);
    allPluralTranslations.set(poFile.shortCode, pluralEntries);
    allFuzzyKeys.set(poFile.shortCode, fuzzyKeys || new Set());
    const meta = extractMeta(header);
    langNplurals.set(poFile.shortCode, _parseNplurals(meta.pluralForms));
  }

  // Determine reference language: the one with the most keys
  let refLang = '';
  let maxKeys = 0;
  for (const [lang, entries] of allTranslations) {
    if (entries.size > maxKeys) {
      maxKeys = entries.size;
      refLang = lang;
    }
  }

  const refEntries = allTranslations.get(refLang);
  const languages = poFiles.map((f) => f.shortCode);
  const issues = [];

  for (const [lang, entries] of allTranslations) {
    if (lang === refLang) {
      // Check empty translations in reference too
      for (const [key, value] of entries) {
        if (value === '') {
          issues.push({
            severity: 'warning',
            type: 'empty-translation',
            lang,
            key,
            message: `Empty translation in reference language (${lang})`,
          });
        }
      }
      continue;
    }

    // Missing keys
    for (const [key] of refEntries) {
      if (!entries.has(key)) {
        issues.push({
          severity: 'error',
          type: 'missing-key',
          lang,
          key,
          message: `Key missing in ${lang} (present in ${refLang})`,
        });
      }
    }

    // Extra keys
    for (const [key] of entries) {
      if (!refEntries.has(key)) {
        issues.push({
          severity: 'warning',
          type: 'extra-key',
          lang,
          key,
          message: `Extra key in ${lang} (not in ${refLang})`,
        });
      }
    }

    // Empty translations & variable mismatch
    for (const [key, value] of entries) {
      if (value === '') {
        issues.push({
          severity: 'warning',
          type: 'empty-translation',
          lang,
          key,
          message: `Empty translation in ${lang}`,
        });
      }

      // Variable consistency check
      const refValue = refEntries.get(key);
      if (refValue && value) {
        const refVars = extractVariables(refValue);
        const langVars = extractVariables(value);

        if (refVars.length > 0 || langVars.length > 0) {
          const missingVars = refVars.filter((v) => !langVars.includes(v));
          const extraVars = langVars.filter((v) => !refVars.includes(v));

          if (missingVars.length > 0) {
            issues.push({
              severity: 'error',
              type: 'variable-mismatch',
              lang,
              key,
              message: `Missing variables in ${lang}: ${missingVars.join(', ')} (expected from ${refLang})`,
            });
          }

          if (extraVars.length > 0) {
            issues.push({
              severity: 'warning',
              type: 'variable-mismatch',
              lang,
              key,
              message: `Extra variables in ${lang}: ${extraVars.join(', ')} (not in ${refLang})`,
            });
          }
        }
      }
    }
  }

  // ── Fuzzy entry detection ──────────────────────────────────────────

  for (const [lang, fuzzyKeys] of allFuzzyKeys) {
    for (const key of fuzzyKeys) {
      issues.push({
        severity: 'warning',
        type: 'fuzzy-entry',
        lang,
        key,
        message: `Fuzzy translation in ${lang} — needs review`,
      });
    }
  }

  // ── Plural entry validation ──────────────────────────────────────────

  // Determine reference plural entries
  const refPluralEntries = allPluralTranslations.get(refLang) || new Map();
  const refNplurals = langNplurals.get(refLang);

  for (const [lang, pluralEntries] of allPluralTranslations) {
    const nplurals = langNplurals.get(lang);

    if (lang === refLang) {
      // Check nplurals mismatch and empty forms in reference
      for (const [key, entry] of pluralEntries) {
        const displayKey = key.includes('\x04') ? key.replace('\x04', '::') : key;

        // nplurals mismatch
        if (nplurals !== undefined && entry.msgstr.length !== nplurals) {
          issues.push({
            severity: 'warning',
            type: 'nplurals-mismatch',
            lang,
            key,
            message: `Plural form count mismatch in ${lang}: has ${entry.msgstr.length} forms, header declares nplurals=${nplurals}`,
          });
        }

        // Empty plural forms
        for (let n = 0; n < entry.msgstr.length; n++) {
          if (entry.msgstr[n] === '') {
            issues.push({
              severity: 'warning',
              type: 'empty-plural-form',
              lang,
              key,
              message: `Empty plural form [${n}] in reference language (${lang})`,
            });
          }
        }
      }
      continue;
    }

    // Missing plural keys (in ref but not in target)
    for (const [key] of refPluralEntries) {
      if (!pluralEntries.has(key)) {
        issues.push({
          severity: 'error',
          type: 'missing-plural-key',
          lang,
          key,
          message: `Plural key missing in ${lang} (present in ${refLang})`,
        });
      }
    }

    // Extra plural keys (in target but not in ref)
    for (const [key] of pluralEntries) {
      if (!refPluralEntries.has(key)) {
        issues.push({
          severity: 'warning',
          type: 'extra-plural-key',
          lang,
          key,
          message: `Extra plural key in ${lang} (not in ${refLang})`,
        });
      }
    }

    // Per-entry checks for target languages
    for (const [key, entry] of pluralEntries) {
      const displayKey = key.includes('\x04') ? key.replace('\x04', '::') : key;

      // nplurals mismatch
      if (nplurals !== undefined && entry.msgstr.length !== nplurals) {
        issues.push({
          severity: 'warning',
          type: 'nplurals-mismatch',
          lang,
          key,
          message: `Plural form count mismatch in ${lang}: has ${entry.msgstr.length} forms, header declares nplurals=${nplurals}`,
        });
      }

      // Empty plural forms
      for (let n = 0; n < entry.msgstr.length; n++) {
        if (entry.msgstr[n] === '') {
          issues.push({
            severity: 'warning',
            type: 'empty-plural-form',
            lang,
            key,
            message: `Empty plural form [${n}] in ${lang}`,
          });
        }
      }

      // Variable consistency across plural forms vs reference
      const refEntry = refPluralEntries.get(key);
      if (refEntry) {
        // Collect all variables from all reference forms
        const refVarsSet = new Set();
        for (const form of refEntry.msgstr) {
          for (const v of extractVariables(form)) {
            refVarsSet.add(v);
          }
        }
        const refVars = [...refVarsSet].sort();

        // Check each form in target language
        for (let n = 0; n < entry.msgstr.length; n++) {
          if (!entry.msgstr[n]) continue;
          const formVars = extractVariables(entry.msgstr[n]);
          const missingVars = refVars.filter((v) => !formVars.includes(v));
          const extraVars = formVars.filter((v) => !refVars.includes(v));

          if (missingVars.length > 0) {
            issues.push({
              severity: 'error',
              type: 'variable-mismatch',
              lang,
              key,
              message: `Missing variables in ${lang} plural form [${n}]: ${missingVars.join(', ')} (expected from ${refLang})`,
            });
          }
          if (extraVars.length > 0) {
            issues.push({
              severity: 'warning',
              type: 'variable-mismatch',
              lang,
              key,
              message: `Extra variables in ${lang} plural form [${n}]: ${extraVars.join(', ')} (not in ${refLang})`,
            });
          }
        }
      }
    }
  }

  // Sort: errors first, then warnings; within same severity alphabetically by lang, then key
  issues.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === 'error' ? -1 : 1;
    }
    if (a.lang !== b.lang) {
      return a.lang.localeCompare(b.lang);
    }
    return a.key.localeCompare(b.key);
  });

  // Count total fuzzy keys across all languages
  let totalFuzzyKeys = 0;
  for (const [, fuzzyKeys] of allFuzzyKeys) {
    totalFuzzyKeys += fuzzyKeys.size;
  }

  return { issues, refLang, languages, totalKeys: refEntries.size, totalPluralKeys: refPluralEntries.size, totalFuzzyKeys };
}

// ── Terminal reporter ───────────────────────────────────────────────────

/**
 * Print validation report to terminal with colours.
 * @param {{ issues: ValidationIssue[], refLang: string, languages: string[], totalKeys: number }} result
 */
function printReport(result) {
  const { issues, refLang, languages, totalKeys, totalPluralKeys, totalFuzzyKeys } = result;

  console.log();
  console.log(`${C.bold}translation-toolkit validate${C.reset}`);
  const pluralInfo = totalPluralKeys ? ` + ${totalPluralKeys} plural` : '';
  const fuzzyInfo = totalFuzzyKeys ? ` (${totalFuzzyKeys} fuzzy)` : '';
  console.log(`${C.dim}Reference language: ${refLang} (${totalKeys} keys${pluralInfo})${fuzzyInfo}${C.reset}`);
  console.log(`${C.dim}Languages: ${languages.join(', ')}${C.reset}`);
  console.log();

  if (issues.length === 0) {
    console.log(`${C.green}✓ No issues found. All translations are consistent.${C.reset}\n`);
    return;
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  // Group by language
  const byLang = new Map();
  for (const issue of issues) {
    if (!byLang.has(issue.lang)) {
      byLang.set(issue.lang, []);
    }
    byLang.get(issue.lang).push(issue);
  }

  for (const [lang, langIssues] of byLang) {
    const langErrors = langIssues.filter((i) => i.severity === 'error').length;
    const langWarnings = langIssues.filter((i) => i.severity === 'warning').length;

    console.log(`${C.bold}${C.cyan}[${lang.toUpperCase()}]${C.reset}  ${langErrors ? C.red + langErrors + ' errors' + C.reset : ''}${langErrors && langWarnings ? ', ' : ''}${langWarnings ? C.yellow + langWarnings + ' warnings' + C.reset : ''}`);

    for (const issue of langIssues) {
      const icon = issue.severity === 'error' ? `${C.red}✗` : `${C.yellow}⚠`;
      const typeLabel = issue.type.replace('-', ' ');
      const displayKey = issue.key.replace('\x04', '::');
      console.log(`  ${icon} ${C.dim}${typeLabel}${C.reset}  ${displayKey}`);
      console.log(`    ${C.dim}${issue.message}${C.reset}`);
    }
    console.log();
  }

  // Summary
  console.log(`${C.bold}Summary:${C.reset} ${C.red}${errors.length} errors${C.reset}, ${C.yellow}${warnings.length} warnings${C.reset}\n`);
}

// ── Cross-format validation ─────────────────────────────────────────────

/**
 * @typedef {Object} CrossFormatIssue
 * @property {'error' | 'warning'} severity
 * @property {string} type
 * @property {string} lang
 * @property {string} key
 * @property {string} message
 */

/**
 * Compare keys between .po files and exported JSON/i18next files.
 * Reports missing keys, extra keys, value mismatches, and language coverage issues.
 *
 * @param {string} translationsDir - directory containing .po files
 * @param {string} formatDir - directory containing exported JSON/i18next files
 * @param {'json' | 'i18next'} format - format type
 * @param {number} [compatibilityJSON=4] - i18next compatibility version (3 or 4)
 * @returns {{ issues: CrossFormatIssue[], poLanguages: string[], formatLanguages: string[], totalPoKeys: number, totalFormatKeys: number }}
 */
function crossFormatValidation(translationsDir, formatDir, format, compatibilityJSON = 4) {
  const issues = [];

  // Discover .po files
  const poFiles = discoverPoFiles(translationsDir);
  if (poFiles.length === 0) {
    return { issues: [], poLanguages: [], formatLanguages: [], totalPoKeys: 0, totalFormatKeys: 0 };
  }
  poFiles.sort((a, b) => a.shortCode.localeCompare(b.shortCode));

  // Discover format files
  const formatFiles = format === 'json'
    ? discoverJsonFiles(formatDir)
    : discoverI18nextFiles(formatDir);
  formatFiles.sort((a, b) => a.shortCode.localeCompare(b.shortCode));

  const poLanguages = poFiles.map((f) => f.shortCode);
  const formatLanguages = formatFiles.map((f) => f.shortCode);

  // Check missing/extra language files
  const poLangSet = new Set(poLanguages);
  const formatLangSet = new Set(formatLanguages);

  for (const lang of poLanguages) {
    if (!formatLangSet.has(lang)) {
      issues.push({
        severity: 'error',
        type: 'cross-format-missing-lang',
        lang,
        key: '',
        message: `Language "${lang}" exists in .po but has no ${format} file in ${formatDir}`,
      });
    }
  }

  for (const lang of formatLanguages) {
    if (!poLangSet.has(lang)) {
      issues.push({
        severity: 'warning',
        type: 'cross-format-extra-lang',
        lang,
        key: '',
        message: `Language "${lang}" has a ${format} file but no .po file`,
      });
    }
  }

  // Compare keys for each common language
  let totalPoKeys = 0;
  let totalFormatKeys = 0;

  for (const poFile of poFiles) {
    const lang = poFile.shortCode;
    if (!formatLangSet.has(lang)) continue;

    const formatFile = formatFiles.find((f) => f.shortCode === lang);

    // Parse .po
    const { entries: poEntries, pluralEntries: poPluralEntries } = parsePo(poFile.filePath);
    totalPoKeys = Math.max(totalPoKeys, poEntries.size + poPluralEntries.size);

    // Parse format file
    let fmtEntries, fmtPluralEntries;
    if (format === 'json') {
      const parsed = parseJsonFile(formatFile.filePath);
      fmtEntries = parsed.entries;
      fmtPluralEntries = parsed.pluralEntries;
    } else {
      const parsed = parseI18nextFile(formatFile.filePath, lang, compatibilityJSON);
      fmtEntries = parsed.entries;
      fmtPluralEntries = parsed.pluralEntries;
    }
    totalFormatKeys = Math.max(totalFormatKeys, fmtEntries.size + fmtPluralEntries.size);

    // ── Singular entries ──────────────────────────────────────────────

    // Missing in format (po has it, format doesn't)
    for (const [key, poValue] of poEntries) {
      const displayKey = key.includes('\x04') ? key.replace('\x04', '::') : key;

      if (!fmtEntries.has(key)) {
        issues.push({
          severity: 'error',
          type: 'cross-format-missing-key',
          lang,
          key,
          message: `Key "${displayKey}" in .po but missing from ${format} export (${lang})`,
        });
      } else {
        // Value mismatch check
        const fmtValue = fmtEntries.get(key);
        if (poValue !== fmtValue) {
          issues.push({
            severity: 'warning',
            type: 'cross-format-value-mismatch',
            lang,
            key,
            message: `Value mismatch for "${displayKey}" in ${lang} — .po: "${_truncate(poValue, 40)}" vs ${format}: "${_truncate(fmtValue, 40)}"`,
          });
        }
      }
    }

    // Extra in format (format has it, po doesn't)
    for (const [key] of fmtEntries) {
      if (!poEntries.has(key)) {
        const displayKey = key.includes('\x04') ? key.replace('\x04', '::') : key;
        issues.push({
          severity: 'warning',
          type: 'cross-format-extra-key',
          lang,
          key,
          message: `Key "${displayKey}" in ${format} export but missing from .po (${lang})`,
        });
      }
    }

    // ── Plural entries ────────────────────────────────────────────────

    // Missing plural in format
    for (const [key, poEntry] of poPluralEntries) {
      const displayKey = key.includes('\x04') ? key.replace('\x04', '::') : key;

      if (!fmtPluralEntries.has(key)) {
        issues.push({
          severity: 'error',
          type: 'cross-format-missing-plural',
          lang,
          key,
          message: `Plural key "${displayKey}" in .po but missing from ${format} export (${lang})`,
        });
      } else {
        // Compare plural forms
        const fmtEntry = fmtPluralEntries.get(key);
        const poForms = poEntry.msgstr;
        const fmtForms = fmtEntry.msgstr;

        // Compare form-by-form (up to shorter length)
        const maxForms = Math.max(poForms.length, fmtForms.length);
        let mismatchFound = false;
        for (let n = 0; n < maxForms; n++) {
          const poForm = poForms[n] || '';
          const fmtForm = fmtForms[n] || '';
          if (poForm !== fmtForm) {
            mismatchFound = true;
            break;
          }
        }

        if (mismatchFound) {
          issues.push({
            severity: 'warning',
            type: 'cross-format-plural-mismatch',
            lang,
            key,
            message: `Plural forms mismatch for "${displayKey}" in ${lang} — .po has ${poForms.length} forms vs ${format} has ${fmtForms.length} forms`,
          });
        }
      }
    }

    // Extra plural in format
    for (const [key] of fmtPluralEntries) {
      if (!poPluralEntries.has(key)) {
        const displayKey = key.includes('\x04') ? key.replace('\x04', '::') : key;
        issues.push({
          severity: 'warning',
          type: 'cross-format-extra-plural',
          lang,
          key,
          message: `Plural key "${displayKey}" in ${format} export but missing from .po (${lang})`,
        });
      }
    }
  }

  // Sort: errors first, then by lang, then by key
  issues.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === 'error' ? -1 : 1;
    }
    if (a.lang !== b.lang) {
      return a.lang.localeCompare(b.lang);
    }
    return a.key.localeCompare(b.key);
  });

  return { issues, poLanguages, formatLanguages, totalPoKeys, totalFormatKeys };
}

/**
 * Truncate a string for display in mismatch messages.
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
function _truncate(str, maxLen) {
  if (!str) return '';
  const single = str.replace(/\n/g, '\\n');
  if (single.length <= maxLen) return single;
  return single.substring(0, maxLen - 3) + '...';
}

/**
 * Print cross-format validation report to terminal with colours.
 * @param {{ issues: CrossFormatIssue[], poLanguages: string[], formatLanguages: string[], totalPoKeys: number, totalFormatKeys: number }} result
 * @param {'json' | 'i18next'} format
 */
function printCrossFormatReport(result, format) {
  const { issues, poLanguages, formatLanguages, totalPoKeys, totalFormatKeys } = result;

  console.log();
  console.log(`${C.bold}translation-toolkit validate --cross-format ${format}${C.reset}`);
  console.log(`${C.dim}.po languages: ${poLanguages.join(', ')} (${totalPoKeys} keys)${C.reset}`);
  console.log(`${C.dim}${format} languages: ${formatLanguages.join(', ')} (${totalFormatKeys} keys)${C.reset}`);
  console.log();

  if (issues.length === 0) {
    console.log(`${C.green}✓ All ${format} files are in sync with .po files.${C.reset}\n`);
    return;
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  // Group by language
  const byLang = new Map();
  for (const issue of issues) {
    const lang = issue.lang || '_global';
    if (!byLang.has(lang)) {
      byLang.set(lang, []);
    }
    byLang.get(lang).push(issue);
  }

  for (const [lang, langIssues] of byLang) {
    const langErrors = langIssues.filter((i) => i.severity === 'error').length;
    const langWarnings = langIssues.filter((i) => i.severity === 'warning').length;

    console.log(`${C.bold}${C.cyan}[${lang.toUpperCase()}]${C.reset}  ${langErrors ? C.red + langErrors + ' errors' + C.reset : ''}${langErrors && langWarnings ? ', ' : ''}${langWarnings ? C.yellow + langWarnings + ' warnings' + C.reset : ''}`);

    for (const issue of langIssues) {
      const icon = issue.severity === 'error' ? `${C.red}✗` : `${C.yellow}⚠`;
      const typeLabel = issue.type.replace(/^cross-format-/, '').replace(/-/g, ' ');
      const displayKey = issue.key ? (issue.key.includes('\x04') ? issue.key.replace('\x04', '::') : issue.key) : '(language)';
      console.log(`  ${icon} ${C.dim}${typeLabel}${C.reset}  ${displayKey}`);
      console.log(`    ${C.dim}${issue.message}${C.reset}`);
    }
    console.log();
  }

  console.log(`${C.bold}Summary:${C.reset} ${C.red}${errors.length} errors${C.reset}, ${C.yellow}${warnings.length} warnings${C.reset}\n`);
}

// ── CLI runner ──────────────────────────────────────────────────────────

/**
 * Parse CLI args and run validation.
 * @param {string[]} args
 */
async function runValidate(args) {
  let dirArg;
  let jsonOutput = false;
  let severityFilter = 'warning'; // default: show all (warnings + errors)
  let crossFormat = null;    // 'json' | 'i18next'
  let formatDir = null;
  let compat = 4;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' || args[i] === '-d') {
      dirArg = args[i + 1];
      i++;
    } else if (args[i] === '--json') {
      jsonOutput = true;
    } else if (args[i] === '--severity') {
      severityFilter = (args[i + 1] || 'warning').toLowerCase();
      i++;
    } else if (args[i] === '--cross-format') {
      crossFormat = (args[i + 1] || '').toLowerCase();
      i++;
      if (crossFormat !== 'json' && crossFormat !== 'i18next') {
        console.error('Error: --cross-format must be "json" or "i18next"');
        process.exit(1);
      }
    } else if (args[i] === '--format-dir') {
      formatDir = args[i + 1];
      i++;
    } else if (args[i] === '--compat') {
      compat = parseInt(args[i + 1], 10) || 4;
      i++;
    }
  }

  const translationsDir = await resolveTranslationsDir(dirArg);

  // Standard .po validation (always runs unless --cross-format-only in future)
  const result = validateTranslations(translationsDir);

  // Apply severity filter
  if (severityFilter === 'error') {
    result.issues = result.issues.filter(i => i.severity === 'error');
  }
  // 'warning' (default) shows everything

  // Cross-format validation
  let crossResult = null;
  if (crossFormat) {
    if (!formatDir) {
      console.error('Error: --format-dir is required when using --cross-format');
      process.exit(1);
    }
    const resolvedFormatDir = path.resolve(formatDir);
    if (!fs.existsSync(resolvedFormatDir)) {
      console.error(`Error: format directory does not exist: ${resolvedFormatDir}`);
      process.exit(1);
    }
    crossResult = crossFormatValidation(translationsDir, resolvedFormatDir, crossFormat, compat);

    // Apply severity filter to cross-format issues too
    if (severityFilter === 'error') {
      crossResult.issues = crossResult.issues.filter(i => i.severity === 'error');
    }
  }

  if (jsonOutput) {
    const errors = result.issues.filter(i => i.severity === 'error');
    const warnings = result.issues.filter(i => i.severity === 'warning');
    const output = {
      errors: errors.map(i => ({
        type: i.type,
        lang: i.lang,
        key: i.key.replace('\x04', '::'),
        message: i.message,
      })),
      warnings: warnings.map(i => ({
        type: i.type,
        lang: i.lang,
        key: i.key.replace('\x04', '::'),
        message: i.message,
      })),
      summary: {
        refLang: result.refLang,
        languages: result.languages,
        totalKeys: result.totalKeys,
        totalPluralKeys: result.totalPluralKeys || 0,
        totalFuzzyKeys: result.totalFuzzyKeys || 0,
        errorCount: errors.length,
        warningCount: warnings.length,
      },
    };

    // Append cross-format results to JSON output
    if (crossResult) {
      const crossErrors = crossResult.issues.filter(i => i.severity === 'error');
      const crossWarnings = crossResult.issues.filter(i => i.severity === 'warning');
      output.crossFormat = {
        format: crossFormat,
        errors: crossErrors.map(i => ({
          type: i.type,
          lang: i.lang,
          key: i.key.replace('\x04', '::'),
          message: i.message,
        })),
        warnings: crossWarnings.map(i => ({
          type: i.type,
          lang: i.lang,
          key: i.key.replace('\x04', '::'),
          message: i.message,
        })),
        summary: {
          poLanguages: crossResult.poLanguages,
          formatLanguages: crossResult.formatLanguages,
          totalPoKeys: crossResult.totalPoKeys,
          totalFormatKeys: crossResult.totalFormatKeys,
          errorCount: crossErrors.length,
          warningCount: crossWarnings.length,
        },
      };
    }

    console.log(JSON.stringify(output, null, 2));
  } else {
    printReport(result);
    if (crossResult) {
      printCrossFormatReport(crossResult, crossFormat);
    }
  }

  // Exit with code 1 if there are errors (useful for CI)
  const hasErrors = result.issues.some((i) => i.severity === 'error');
  const hasCrossErrors = crossResult && crossResult.issues.some((i) => i.severity === 'error');
  if (hasErrors || hasCrossErrors) {
    process.exit(1);
  }
}

module.exports = { validateTranslations, crossFormatValidation, runValidate };
