# Changelog

All notable changes to **translation-toolkit** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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

[1.3.0]: https://github.com/qubuss/translation-toolkit/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/qubuss/translation-toolkit/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/qubuss/translation-toolkit/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/qubuss/translation-toolkit/releases/tag/v1.1.0
