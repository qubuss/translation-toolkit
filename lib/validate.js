/**
 * Validate translation files for common issues:
 * - Missing keys (present in reference language, absent in target)
 * - Extra keys (present in target, absent in reference language)
 * - Empty translations (msgstr is empty string)
 * - Inconsistent variables ({{var}} mismatch between languages)
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

// ── CLI runner ──────────────────────────────────────────────────────────

/**
 * Parse CLI args and run validation.
 * @param {string[]} args
 */
async function runValidate(args) {
  let dirArg;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' || args[i] === '-d') {
      dirArg = args[i + 1];
      i++;
    }
  }

  const translationsDir = await resolveTranslationsDir(dirArg);
  const result = validateTranslations(translationsDir);
  printReport(result);

  // Exit with code 1 if there are errors (useful for CI)
  const hasErrors = result.issues.some((i) => i.severity === 'error');
  if (hasErrors) {
    process.exit(1);
  }
}

module.exports = { validateTranslations, runValidate };
