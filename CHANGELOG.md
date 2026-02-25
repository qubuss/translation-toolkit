# Changelog

All notable changes to **translation-toolkit** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.0.0] — 2026-02-25

### Breaking Changes

- **Removed `po-csv-tool` legacy CLI alias** — the `bin/po-csv-tool.js` file has been deleted. Use `translation-toolkit` (the primary command) instead. The legacy alias was never registered in `package.json` `"bin"` and was not functional since v1.1.0.
- **Minimum Node.js version raised to 18** — `engines.node` changed from `>=14` to `>=18`. Node 18+ is required for tests (`node:test`), and all LTS versions below 18 are EOL.
- **`"main"` entry point changed** — `require('translation-toolkit')` now returns a proper API object (via `index.js`) exporting all public core functions from every module, instead of just `poParser.js`.

### Added

- **Programmatic API (`index.js`)** — new entry point re-exports all public functions: `parsePo`, `writePo`, `patchPoFile`, `exportToCsv`, `importFromCsv`, `exportToJson`, `importFromJson`, `exportToI18next`, `importFromI18next`, `validateTranslations`, `crossFormatValidation`, `computeStats`, `computeDiff`, `buildHtml`, `generateStaticPreview`, and more. Enables `const { parsePo } = require('translation-toolkit')` without reaching into `lib/`.

### Fixed

- **CHANGELOG date corrections** — versions 1.5.0–1.9.0 had incorrect dates (2025 instead of 2026); all dates now match actual git commit timestamps
- **Duplicate `[1.7.0]` comparison link** — removed duplicate entry from CHANGELOG footer
- **`--static` default path in help text** — corrected from `translation-preview.html` to `translation-preview/index.html` (matches actual code behavior)

### Changed

- **README polished for v2.0** — updated project description to mention JSON/i18next formats; added JSON export/i18next/cross-format validation to features list; expanded CSV Format section with `key[N]` plural convention and `msgctxt` `::` separator; expanded Limitations section; updated Roadmap (Phase 3 fully done); added Programmatic API section; improved Contributing section with code conventions and zero-dependency policy
- **`package.json` cleanup** — `"files"` now includes `index.js`; description unchanged but `"main"` points to `./index.js`

## [1.9.0] — 2026-02-25

### Added

- **`--cross-format` for `validate`** — compare `.po` keys against exported JSON or i18next files to detect synchronization issues; reports missing keys, extra keys, value mismatches, and language coverage gaps; CI-friendly with exit code 1 on errors
- **`--format-dir` for `validate`** — specify the directory containing exported JSON/i18next files (required with `--cross-format`)
- **`--compat` for `validate`** — i18next compatibility version for cross-format checks (3 or 4, default: 4)
- **`crossFormatValidation()` core function** — new exported function in `lib/validate.js`; compares singular/plural entries between `.po` and JSON/i18next exports; returns typed issues: `cross-format-missing-key`, `cross-format-extra-key`, `cross-format-value-mismatch`, `cross-format-missing-lang`, `cross-format-extra-lang`, `cross-format-missing-plural`, `cross-format-extra-plural`, `cross-format-plural-mismatch`
- **Cross-format JSON output** — when `--json` is used with `--cross-format`, output includes a `crossFormat` section with errors, warnings, and summary statistics
- **Coloured cross-format report** — terminal output groups issues by language with error/warning counts, styled consistently with existing validation report

### Tests

- 373 tests across 100 suites (was 346 / 85)
- New `test/crossFormat.test.js` — 27 tests / 15 suites covering JSON sync, i18next sync, missing/extra keys, value mismatches, missing/extra languages, plural sync, msgctxt keys, fixture reference checks (4 fixtures), CLI exit codes, JSON output, severity filter, error handling

## [1.8.0] — 2026-02-24

### Added

- **`--format i18next` for `export`** — export `.po` translations to per-language i18next-compatible JSON files; singular entries become string values; plural entries use CLDR suffixes (`_one`, `_other`, `_few`, `_many`, etc.) for v4 (default), or `_plural`/`_0`/`_1`/`_2` for v3 legacy mode
- **`--format i18next` for `import`** — import i18next JSON files back into `.po` files; auto-detects CLDR plural suffixes (v4) or legacy suffixes (v3) and maps them back to gettext `msgstr[N]` indices; supports `--merge`, `--dry-run`
- **`--compat` flag** — specify i18next compatibility version: `--compat 4` (default, CLDR categories) or `--compat 3` (legacy `_plural`/`_N` suffixes); applies to both export and import
- **New `lib/i18nextFormat.js` module** — `exportToI18next()`, `importFromI18next()`, `parseI18nextFile()`, `discoverI18nextFiles()` core functions; `GETTEXT_TO_CLDR` mapping for 14 languages (en, de, fr, es, it, pt, nl, hu, pl, ru, uk, cs, sk, ro) + Arabic (6 forms); zero dependencies
- **CLDR plural mapping** — gettext form indices correctly mapped to CLDR categories per language: nplurals=2 → `one`/`other`, Polish/Russian nplurals=3 → `one`/`few`/`many`, Czech/Slovak nplurals=3 → `one`/`few`/`other`, Arabic nplurals=6 → `zero`/`one`/`two`/`few`/`many`/`other`

### Tests

- 346 tests across 85 suites (was 290 / 70)
- Added static JSON and i18next fixture files for regression protection
- Added "export matches fixture" tests for both JSON and i18next formats

## [1.7.0] — 2026-02-24

### Added

- **`--format json` for `export`** — export `.po` translations to per-language flat JSON files (`en.json`, `pl.json`, etc.); singular entries become string values, plural entries become arrays of strings; keys with `msgctxt` use `::` separator; output is pretty-printed with 2-space indentation
- **`--format json` for `import`** — import per-language JSON files back into `.po` files; supports `--merge`, `--dry-run`, and all existing import flags; auto-detects nested JSON and flattens with dot-separated keys
- **New `lib/jsonFormat.js` module** — `exportToJson()`, `importFromJson()`, `parseJsonFile()`, `discoverJsonFiles()` core functions + `_flattenObject`, `_isNested` helpers; zero dependencies
- **Nested JSON auto-flatten on import** — nested objects like `{ "menu": { "save": "Save" } }` are automatically flattened to dot-separated keys (`menu.save`); arrays are preserved as plural forms

### Tests

- 290 tests across 70 suites (was 257 / 62)

## [1.6.0] — 2026-02-24

### Added

- **`_status` column in CSV export** — exported CSV now includes a `_status` column (between `key` and language columns) containing `fuzzy` for entries marked `#, fuzzy` in any language, empty otherwise; export log reports fuzzy count alongside key/plural counts
- **`--no-status` flag for `export`** — omit the `_status` column from CSV output for backwards-compatible workflows
- **Backwards-compatible CSV import** — `import`, `diff`, and `preview` commands auto-detect the `_status` column and skip it when parsing language values; old CSVs without `_status` continue to work unchanged
- **Fuzzy import / unfuzzy via `_status` column** — when importing a CSV with `_status`, entries with empty status are unfuzzied (the `#, fuzzy` flag is removed from `.po` files); entries with `_status=fuzzy` keep their fuzzy flag; preserves other comment flags like `c-format`; works for both singular and plural entries
- **`_applyFuzzyChange()` in `poParser.js`** — new internal helper that modifies `#, fuzzy` in comment buffers, supporting add/remove of the fuzzy flag while preserving other flags on the same `#,` line
- **`patchPoFile()` comment buffering** — refactored to buffer comment/blank lines before flushing, enabling fuzzy flag manipulation when composite key is known; new 5th parameter `fuzzyChanges: Map<string, boolean>`
- **`--json` flag for `validate`** — outputs validation results as machine-readable JSON: `{ errors: [...], warnings: [...], summary: { refLang, languages, totalKeys, totalPluralKeys, totalFuzzyKeys, errorCount, warningCount } }`; `\x04` separator replaced with `::` in JSON keys; useful for CI/CD pipelines
- **`--severity` flag for `validate`** — filter issues by severity level: `--severity error` shows only errors (hides warnings like fuzzy entries), `--severity warning` (default) shows everything; works with both text and `--json` output

### Tests

- 257 tests across 62 suites (was 232 / 58)

## [1.5.2] — 2026-02-23

### Added

- **Fuzzy detection across all commands** — `parsePo()` now tracks `#, fuzzy` flags and returns a `fuzzyKeys: Set<string>` field; `validate` emits `fuzzy-entry` warnings with severity `warning`; `stats` reports fuzzy count per language; `preview` renders a yellow "fuzzy" badge and `.fuzzy-row` highlight; static preview includes the same fuzzy indicators
- **`po-csv-tool.js` help sync** — legacy CLI alias now documents `--dry-run/-n`, `--watch/-w`, `--exit-zero`, port auto-increment, and includes updated examples

### Fixed

- **A2 — `test-prompt.md` delimiter references** — manual QA script incorrectly used comma `,` syntax for default pipe-delimited `|` exports; fixed in checklist headers, awk/sed commands, and row construction scripts
- **A3 — Preview port messages invisible in background mode** — all server startup messages (`console.log`) changed to `console.error` so they appear even when the preview server is started as a background process (`&`)
- **CHANGELOG v1.1.0 false claim** — `validate` description incorrectly claimed fuzzy detection existed since v1.1.0; removed (now properly implemented in this release)

### Tests

- 204 tests across 50 suites (was 187 / 46)

## [1.5.1] — 2026-02-23

### Added

- **`test/validate.test.js`** — new test file covering `validateTranslations()` singular and plural validation: missing-key, extra-key, empty-translation, variable-mismatch, nplurals-mismatch, empty-plural-form, missing-plural-key, extra-plural-key, plural variable consistency (25 tests / 8 suites)
- **`test/stats.test.js`** — new test file covering `computeStats()` singular and plural statistics: refLang, coverage, pluralKeys, pluralForms, emptyPluralForms, topMissingCount parameter (16 tests / 5 suites)
- **Preview plural tests** — 11 new tests in `test/preview.test.js` covering plural-row CSS class, plural-badge, key[N] rendering, click guard, and `generateStaticPreview()` plural content
- **Custom delimiter (`-D`) tests** — 4 new tests in `test/roundtrip.test.js` covering comma-delimited export, comma and tab round-trip, and comma plural round-trip
- **Merge mode (`--merge`) tests** — 5 new tests in `test/roundtrip.test.js` covering replace mode key removal, merge mode key preservation, merge update values, merge add new keys, and merge dry-run report
- **Validate CLI exit code tests** — 2 new tests in `test/validate.test.js` covering `exit 0` for clean translations and `exit 1` when errors exist
- **test-prompt.md updates** — version 1.5.0→1.5.1, added section 2a (custom delimiter `-D` test), section 4a (import `--merge` mode test), validate exit code checklist item, fixed `--static` default path, added R11/R12/R13 regression tests to report table

### Tests

- 187 tests across 46 suites (was 176 / 43)

## [1.5.0] — 2026-02-23

### Added

- **Plural forms support** — full `msgid_plural` / `msgstr[N]` pipeline across all commands (Phase 2)
- **`parsePo()` returns `pluralEntries`** — new `Map<string, PluralEntry>` field with `{ msgid, msgid_plural, msgstr: string[], msgctxt? }` per plural key
- **`writePo()` plural parameter** — optional 4th argument `pluralEntries` writes `msgid_plural` + `msgstr[0]`…`msgstr[N]` blocks
- **`patchPoFile()` plural patching** — optional 4th argument `newPluralEntries` patches individual `msgstr[N]` forms in-place, preserving formatting
- **Export emits `key[N]` rows** — plural entries appear as `key[0]`, `key[1]`, `key[2]` etc. in CSV output, one row per form
- **Import detects `key[N]` pattern** — groups plural CSV rows back into `PluralEntry` objects and passes them to `patchPoFile()`
- **Validate checks plurals** — new checks: `nplurals-mismatch`, `empty-plural-form`, `missing-plural-key`, `extra-plural-key`, variable consistency in plural forms
- **Stats include plural counts** — per-language `pluralKeys`, `pluralForms`, `emptyPluralForms` counters; report shows "Plurals: X entries (Y forms, Z empty)"
- **Preview shows plural rows** — plural entries displayed as `key[N]` rows with a "plural" badge and subtle accent background; plural rows are read-only (no inline editing)
- **Static preview includes plurals** — `generateStaticPreview()` emits plural rows in the standalone HTML
- **Diff includes plural entries** — `loadPoAsCsv()` now includes `key[N]` rows so CSV-vs-PO diff correctly compares plural translations

### Tests

- 126 tests across 27 suites (was 123 / 26 before diff plural tests; was 96 / 22 before v1.5.0)

## [1.4.1] — 2026-02-23

### Changed

- **`--static` default output** — now generates `translation-preview/index.html` instead of `translation-preview.html` in the project root (keeps root clean). The `-o` flag still overrides the path.
- **Port auto-increment guard fix** — the "max 20 retries" check now compares against the originally requested port (was always false before)
- Stale listeners are removed before retrying the next port (`server.removeAllListeners('listening')`)

### Added

- **`--exit-zero` flag for `diff`** — always exit with code 0 even when differences are found; useful for informational diffs in CI pipelines
- New `test/diff.test.js` — 5 tests for `computeDiff()` and CLI exit codes

### Tests

- 96 tests across 22 suites (was 91 / 20)

## [1.4.0] — 2026-02-22

### Added

- **`--static` / `-s` flag for `preview`** — generates a standalone, self-contained HTML file with all translations, validation, statistics, and diff functionality embedded. No server required — open directly in a browser or deploy to GitHub Pages / S3.
- **`--output` / `-o` flag for `preview`** — specify the output file path when using `--static` (default: `translation-preview.html`)
- **Client-side diff in static previews** — the Diff tab works fully offline with a built-in CSV parser and diff engine running in the browser
- **Static footer** — static previews show a generation timestamp and tool version in the footer
- **GitHub Pages deployment example** in README — CI/CD workflow for generating and publishing static previews

### Changed

- `buildHtml()` and `generateStaticPreview()` now exported from `lib/preview.js` for testability
- `--watch` + `--static` combination is rejected with a clear error message
- Inline editing and save functionality are gracefully disabled in static mode (read-only)

### Tests

- 91 tests across 20 suites (added 20 preview/static tests in 4 new suites)

## [1.3.2] — 2026-02-22

### Added

- **`--ci` flag** — non-interactive mode for CI/CD pipelines; auto-selects the first `.po` directory when multiple are found instead of prompting on stdin (all commands)
- **`--help` improvements** — documented pipe-separated format, `--ci` flag, exit codes, and `-D` delimiter override
- **CI/CD section in README** — GitHub Actions example, best practices for `--ci` and `--dir`

### Fixed

- **Preview: table header row STILL at 4th position** — root cause was `overflow: hidden` on `<table>` creating a new CSS scroll container, making `position: sticky` resolve relative to the table instead of the viewport. Removed `overflow: hidden`, switched to `border-collapse: separate` with `border-spacing: 0`, added corner cell border-radius for visual parity

## [1.3.1] — 2026-02-20

### Fixed

- **BLOCKER — Preview: `--watch` crash** — `fs` module was never required in `preview.js`, causing `fs is not defined` when `--watch` mode tried to call `fs.watch()`
- **Preview: table header row stuck at 4th position** — replaced hardcoded CSS `top` pixel values (54 px / 98 px / 152 px) with CSS custom properties (`--header-h`, `--tabs-h`, `--toolbar-h`) measured at runtime via `ResizeObserver`, so the sticky offsets always match actual rendered heights
- **Import: multiline Plural-Forms header normalised to single line** — new `patchPoFile()` function edits `.po` files in-place, preserving the original header block byte-for-byte instead of regenerating it from metadata
- **Import: blank-line pattern changed between entries** — `patchPoFile()` preserves original comments, blank lines, and string formatting; only the `msgstr` value of changed entries is rewritten

### Changed

- Import now uses `patchPoFile()` (in-place patch) instead of `writePo()` (full regeneration) for existing `.po` files

## [1.3.0] — 2026-02-20

### Added

- **Preview: port auto-increment** — if the requested port is busy (`EADDRINUSE`), the server automatically tries the next port (up to 20 attempts)
- **Import: `--dry-run` / `-n`** — shows what would change (added/changed/removed keys per file) without modifying any `.po` files
- **Preview: `--watch` / `-w`** — watches `.po` files for changes and auto-reloads the preview (fs.watch + 300 ms debounce)
- Exit codes documentation in README
- Roadmap table in README (Phase 1–4)

### Tests

- 71 tests across 16 suites (added 2 dry-run tests)

## [1.2.1] — 2026-02-20

### Fixed

- **Preview: table header stuck below first rows** — `.table-wrapper` had `overflow-x: auto` which created a new scroll container, making `position: sticky` on `thead th` relative to the wrapper instead of the viewport. Removed the overflow rule so the header sticks correctly.

## [1.2.0] — 2026-02-20

### Fixed

- **Preview: empty table** — TDZ (Temporal Dead Zone) error caused preview to render an empty table when opened
- **Import: reformatted `.po` files** — long single-line `msgstr` values were being split into multi-line format on import; now the original formatting is preserved

### Changed

- Expanded test fixtures from 10 → 50 entries with comprehensive edge cases (multiline, special chars, msgctxt, long strings, fuzzy, empty)
- Grew test suite from 31 → 69 tests
- Added preview screenshots to README

## [1.1.0] — 2026-02-20

### Added

- Initial public release on npm
- **Export** — `.po` → CSV with multiline support, `msgctxt` (`::` separator)
- **Import** — CSV → `.po` with merge modes (`merge` / `replace`), format preservation
- **Preview** — browser-based translation viewer with inline editing, dark mode, search, validation tab, statistics tab, diff tab
- **Validate** — detects missing translations, empty `msgstr`, variable mismatches
- **Stats** — coverage % per language with progress bars, top missing keys
- **Diff** — CSV-vs-CSV and CSV-vs-PO comparison with added/changed/removed detection
- Multiline string support throughout
- `msgctxt` support (context prefix with `::` separator)
- Zero runtime dependencies
- 31 tests across 12 suites

[2.0.0]: https://github.com/qubuss/translation-toolkit/compare/v1.9.0...v2.0.0
[1.9.0]: https://github.com/qubuss/translation-toolkit/compare/v1.8.0...v1.9.0
[1.8.0]: https://github.com/qubuss/translation-toolkit/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/qubuss/translation-toolkit/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/qubuss/translation-toolkit/compare/v1.5.2...v1.6.0
[1.5.2]: https://github.com/qubuss/translation-toolkit/compare/v1.5.1...v1.5.2
[1.5.1]: https://github.com/qubuss/translation-toolkit/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/qubuss/translation-toolkit/compare/v1.4.1...v1.5.0
[1.4.1]: https://github.com/qubuss/translation-toolkit/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/qubuss/translation-toolkit/compare/v1.3.2...v1.4.0
[1.3.2]: https://github.com/qubuss/translation-toolkit/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/qubuss/translation-toolkit/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/qubuss/translation-toolkit/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/qubuss/translation-toolkit/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/qubuss/translation-toolkit/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/qubuss/translation-toolkit/releases/tag/v1.1.0
