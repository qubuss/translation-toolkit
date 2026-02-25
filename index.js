/**
 * translation-toolkit — programmatic API
 *
 * Re-exports all public functions from every module so that consumers can do:
 *   const { parsePo, exportToCsv, validateTranslations } = require('translation-toolkit');
 *
 * @module translation-toolkit
 */

'use strict';

// ── PO parser ───────────────────────────────────────────────────────────────
const {
  parsePo,
  writePo,
  patchPoFile,
  discoverPoFiles,
  extractMeta,
  escapePo,
  unescapePo,
  formatPoString,
  findPoDirectories,
  resolveTranslationsDir,
} = require('./lib/poParser');

// ── Export / Import (CSV) ───────────────────────────────────────────────────
const { exportToCsv } = require('./lib/export');
const { importFromCsv, parseCsvContent } = require('./lib/import');

// ── JSON format ─────────────────────────────────────────────────────────────
const { exportToJson, importFromJson, parseJsonFile, discoverJsonFiles } = require('./lib/jsonFormat');

// ── i18next format ──────────────────────────────────────────────────────────
const {
  exportToI18next,
  importFromI18next,
  parseI18nextFile,
  discoverI18nextFiles,
  GETTEXT_TO_CLDR,
  CLDR_CATEGORIES,
} = require('./lib/i18nextFormat');

// ── Validate ────────────────────────────────────────────────────────────────
const { validateTranslations, crossFormatValidation } = require('./lib/validate');

// ── Stats ───────────────────────────────────────────────────────────────────
const { computeStats } = require('./lib/stats');

// ── Diff ────────────────────────────────────────────────────────────────────
const { computeDiff, parseCsvFile, loadPoAsCsv } = require('./lib/diff');

// ── Preview ─────────────────────────────────────────────────────────────────
const { buildHtml, generateStaticPreview } = require('./lib/preview');

module.exports = {
  // PO parser
  parsePo,
  writePo,
  patchPoFile,
  discoverPoFiles,
  extractMeta,
  escapePo,
  unescapePo,
  formatPoString,
  findPoDirectories,
  resolveTranslationsDir,

  // Export / Import (CSV)
  exportToCsv,
  importFromCsv,
  parseCsvContent,

  // JSON format
  exportToJson,
  importFromJson,
  parseJsonFile,
  discoverJsonFiles,

  // i18next format
  exportToI18next,
  importFromI18next,
  parseI18nextFile,
  discoverI18nextFiles,
  GETTEXT_TO_CLDR,
  CLDR_CATEGORIES,

  // Validate
  validateTranslations,
  crossFormatValidation,

  // Stats
  computeStats,

  // Diff
  computeDiff,
  parseCsvFile,
  loadPoAsCsv,

  // Preview
  buildHtml,
  generateStaticPreview,
};
