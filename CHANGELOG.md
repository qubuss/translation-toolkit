# Changelog

All notable changes to **translation-toolkit** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
- **Validate** — detects missing translations, empty `msgstr`, variable mismatches, fuzzy entries
- **Stats** — coverage % per language with progress bars, top missing keys
- **Diff** — CSV-vs-CSV and CSV-vs-PO comparison with added/changed/removed detection
- Multiline string support throughout
- `msgctxt` support (context prefix with `::` separator)
- Zero runtime dependencies
- 31 tests across 12 suites

[1.3.2]: https://github.com/qubuss/translation-toolkit/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/qubuss/translation-toolkit/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/qubuss/translation-toolkit/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/qubuss/translation-toolkit/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/qubuss/translation-toolkit/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/qubuss/translation-toolkit/releases/tag/v1.1.0
