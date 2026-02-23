# Copilot Instructions — translation-toolkit

> These instructions are automatically loaded by GitHub Copilot in VS Code and on github.com.
> They describe architecture, conventions, pitfalls, and mandatory workflows for this project.

---

## Project Overview

**translation-toolkit** is a **zero-dependency** Node.js CLI toolkit for managing GNU gettext `.po` translation files. Core workflow: export `.po` → pipe-delimited CSV for editing in spreadsheets, then import CSV back to `.po`.

Six commands: `export`, `import`, `preview`, `validate`, `stats`, `diff`.

- **Runtime:** Node.js ≥ 14
- **Module system:** CommonJS (`require` / `module.exports`)
- **Dependencies:** ZERO — pure Node.js stdlib only. **Never add an npm dependency.**
- **Test runner:** `node:test` (built-in, Node 18+)
- **No build step** — source files are published directly to npm.

---

## Architecture

```
bin/
  translation-toolkit.js   ← Main CLI entry point (package.json "bin")
  po-csv-tool.js            ← Legacy alias (old name, kept for backwards compat)

lib/
  poParser.js  → parsePo, writePo, patchPoFile, discoverPoFiles, escapePo, ...
  export.js    → exportToCsv (core) + runExport (CLI runner)
  import.js    → importFromCsv, parseCsvContent (core) + runImport (CLI runner)
  validate.js  → validateTranslations (core) + runValidate (CLI runner)
  stats.js     → computeStats (core) + runStats (CLI runner)
  diff.js      → computeDiff, parseCsvFile, loadPoAsCsv (core) + runDiff (CLI runner)
  preview.js   → buildHtml, generateStaticPreview (core) + runPreview (CLI runner)

test/
  poParser.test.js   — Parser unit tests (~40 tests)
  roundtrip.test.js  — Export → import → compare integration tests
  preview.test.js    — buildHtml, static preview, CLI --static tests
  diff.test.js       — computeDiff and CLI exit code tests
  fixtures/
    en-US.po, pl-PL.po                     — 50 edge-case entries each
    translations.csv, translations-modified.csv — matching CSV fixtures
```

### Module Pattern

Every `lib/*.js` file exports **two things**:

1. A **core function** — pure logic, no I/O side effects, testable:
   `computeDiff()`, `validateTranslations()`, `computeStats()`, `exportToCsv()`, etc.
2. A **CLI runner** — parses args, calls core function, handles `process.exit()`:
   `runDiff()`, `runValidate()`, `runStats()`, `runExport()`, etc.

Tests import and test the **core functions** directly. CLI behavior is tested via `child_process.execFileSync` against the actual binary.

### CLI Entry Points

Both `bin/translation-toolkit.js` and `bin/po-csv-tool.js` share the same structure: parse `process.argv`, dispatch to the appropriate `run*()` function. When adding a new command or flag, **update both files** to keep the legacy alias working.

---

## Code Conventions

| Convention      | Rule                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| Functions       | `camelCase` — `parsePo`, `escapeCsvField`, `buildHtml`                                                               |
| Constants       | `UPPER_SNAKE_CASE` — `LOCALE_MAP`, `PLURAL_FORMS_MAP`, `IGNORED_DIRS`                                                |
| Private helpers | `_underscore` prefix — `_readEntryBlock`, `_extractValueFromLines`                                                   |
| Files           | `camelCase.js` — `poParser.js`, `preview.js`                                                                         |
| Indent          | 2 spaces                                                                                                             |
| Quotes          | Single quotes (`'`)                                                                                                  |
| Semicolons      | Always                                                                                                               |
| JSDoc           | Required on all public functions (`@param`, `@returns`, `@typedef`)                                                  |
| Dependencies    | **ZERO** — never use `require('pkg')` for any external npm package                                                   |
| Arg parsing     | Manual `for`-loop over `args` array (no library — see existing pattern)                                              |
| Error handling  | `console.error()` + `process.exit(1)` — no custom error classes                                                      |
| Async           | CLI runners are `async` (for `readline` prompts), but most work is synchronous (`fs.readFileSync` / `writeFileSync`) |

### ANSI Colors

A raw `C` color object (`\x1b[...m` escape codes) is **duplicated** in three files:
`lib/validate.js`, `lib/stats.js`, `lib/diff.js`. If you change colors, update **all three**.

---

## ⚠️ Critical Pitfalls

These are the areas most likely to cause bugs. Read carefully before making changes.

### 1. `\x04` (EOT) Internal Key Separator

Entries with `msgctxt` use the non-printable ASCII EOT character (`\x04`) as the internal separator between context and msgid: `context\x04msgid`.

In CSV output and preview UI, this is displayed as `::` → `context::msgid`.

**Every code path** that handles keys must correctly convert between these two representations. Search for `\x04` and `::` when modifying key handling logic.

### 2. `patchPoFile()` — Format Preservation

Located in `lib/poParser.js`. This function edits `.po` files **in-place**, preserving the original formatting byte-for-byte:

- Header block (including multiline `Plural-Forms`)
- Comments (`#.`, `#:`, `#,`, `#|`)
- Blank lines between entries
- Single-line vs multi-line `msgstr` formatting

`patchPoFile()` replaced `writePo()` for existing files since v1.3.1. **Regressions here corrupt real `.po` files.** Always run roundtrip tests after touching this function.

### 3. `preview.js` — 2000+ Line Monolith

This file contains a ~1500-line HTML/CSS/JS template as a **JavaScript template string**. Changes to the preview UI require editing JavaScript embedded inside a template literal inside a Node.js file.

- Very high cognitive load — read the full function before making targeted edits
- The HTML template uses `${...}` interpolation for server-side data injection
- `STATIC_MODE` flag controls client-side behavior (editing disabled, save bar hidden, client-side diff/CSV parser enabled)

### 4. Plural Forms — Silently Skipped

The parser (`parsePo()`) **ignores** `msgid_plural` and `msgstr[N]` lines. They are silently dropped during export/import. This is a **known limitation** documented in `plan.md` (Phase 2 / v1.5). Any code touching the parser must be aware of this gap.

### 5. Two CLI Entry Points

`bin/translation-toolkit.js` (main) and `bin/po-csv-tool.js` (legacy). Both must be updated when adding commands or flags. The legacy one may be slightly out of date — always verify parity.

### 6. Planning Docs Are in Polish

`plan.md` (development roadmap, ~396 lines) and `test-prompt.md` (manual QA script, ~520 lines) are written in Polish. They contain critical context about design decisions and known issues.

---

## Testing

```bash
npm test          # runs: node --test test/*.test.js
```

- **Framework:** `node:test` with `describe`/`it`/`before`/`after` and `node:assert/strict`
- **~96 tests across 22 suites** (update this count in CHANGELOG when tests change)
- **Temp dirs:** Tests create `.tmp*` directories in `test/`, cleaned up in `after()` hooks
- **CLI tests:** Use `child_process.execFileSync` to test actual binary behavior and exit codes
- **No mocking framework** — uses console.log capture (`process.stdout.write`) for output testing

### Test File Mapping

| Feature area                     | Test file           | Tests via                       |
| -------------------------------- | ------------------- | ------------------------------- |
| PO parser, escaping, formatting  | `poParser.test.js`  | Direct function calls           |
| Export → import round-trip       | `roundtrip.test.js` | Direct function calls           |
| Preview HTML, static export      | `preview.test.js`   | Function calls + `execFileSync` |
| Diff computation, CLI exit codes | `diff.test.js`      | Function calls + `execFileSync` |

**Note:** `preview.test.js` references the legacy CLI path (`bin/po-csv-tool.js`), while `diff.test.js` uses the new path (`bin/translation-toolkit.js`). This inconsistency exists but both work.

---

## 📋 Mandatory: CHANGELOG Updates

**Every change must be reflected in `CHANGELOG.md`.** This is non-negotiable.

### Format: Keep a Changelog + SemVer

```markdown
## [X.Y.Z] — YYYY-MM-DD

### Added

- **`--new-flag` for `command`** — description of the feature

### Changed

- **Description of change** — why and what impact

### Fixed

- **BLOCKER — Description** — root cause and fix explanation

### Tests

- X tests across Y suites (was A / B)
```

### Rules

1. **Bump version yourself**: Create a new `## [X.Y.Z] — YYYY-MM-DD` section at the top. Also update `version` in `package.json`.
2. **SemVer**: bugfix → patch (1.4.1 → 1.4.2), new feature/flag → minor (1.4.2 → 1.5.0), breaking change → major
3. **Entry style**: `**bold feature name** — description` with em dash (`—`), not hyphen
4. **Tests counter**: If you added/removed tests, include a `### Tests` section: `X tests across Y suites (was A / B)`. Run `npm test` to get the exact count.
5. **Comparison links**: Add a link at the bottom of the file:
   ```markdown
   [X.Y.Z]: https://github.com/qubuss/translation-toolkit/compare/vPREV...vX.Y.Z
   ```
6. **Date format**: `YYYY-MM-DD` (ISO 8601)

---

## 📋 Mandatory: Git Tags & GitHub Releases

**Every version bump must be tagged and released on GitHub.** Tags are referenced by CHANGELOG comparison links and npm publish.

### Workflow (after merging all changes for a version)

```bash
# 1. Ensure CHANGELOG.md and package.json are updated and committed
git add -A && git commit -m "chore: release vX.Y.Z"

# 2. Create an annotated tag
git tag -a vX.Y.Z -m "vX.Y.Z"

# 3. Push commit and tag
git push && git push --tags

# 4. Publish to npm
npm publish
```

### Rules

1. **Tag format**: `vX.Y.Z` (with `v` prefix) — e.g., `v1.5.0`, `v1.4.2`
2. **Tag matches package.json**: The tag version must exactly match the `version` field in `package.json`
3. **One tag per version**: Do not move or delete tags after pushing
4. **Create GitHub Release** (optional but recommended): After pushing the tag, create a GitHub Release with the CHANGELOG section for that version as the release notes body
5. **Tag before npm publish**: Always tag first, then `npm publish`, so the published version matches a git tag

### Catching Up on Missing Tags

If previous versions lack tags, create them retroactively:

```bash
# Find the commit for a version via CHANGELOG or git log
git log --oneline --all | grep "release\|v1.3"
git tag -a v1.3.0 <commit-hash> -m "v1.3.0"
git push --tags
```

---

## 📋 Mandatory: Test Fixtures — Keep in Sync

Test fixtures in `test/fixtures/` are the foundation of roundtrip tests. **When adding new functionality, update fixtures simultaneously.**

### Files

| File                        | Purpose                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `en-US.po`                  | English PO file — 50 edge-case entries (multiline, special chars, msgctxt, fuzzy, empty, long strings, HTML, Unicode) |
| `pl-PL.po`                  | Polish PO file — matching entries with Polish translations                                                            |
| `translations.csv`          | Pipe-delimited CSV — export of the above PO files                                                                     |
| `translations-modified.csv` | Copy of `translations.csv` with intentional changes (for diff tests)                                                  |

### Rules

1. **Both formats at once**: When adding a new entry, add it to **both** `.po` files AND `translations.csv` simultaneously. The roundtrip test (`roundtrip.test.js`) will fail if they're out of sync.
2. **Modified CSV too**: If the new entry should appear in diff tests, add it (possibly with a changed value) to `translations-modified.csv` as well.
3. **Matching structure**: CSV must have the key in column 1, then language columns matching the `.po` file locale short codes (`en`, `pl`).
4. **New test file**: For a new command or major feature, create `test/<feature>.test.js` following the existing pattern (`describe`/`it`, `assert/strict`, temp dir cleanup).

---

## 📋 Mandatory: test-prompt.md Updates

`test-prompt.md` is a ~520-line manual QA script (in Polish) used to validate the tool on real projects. **Keep it current with every release.**

### Rules

1. **Major features** (new command, new mode like `--static`): Add a **new numbered section** (e.g., `### 13. Test PLURAL FORMS`) with a checklist of manual verification steps. Also add a row to the report table in section 12.
2. **Bug fixes**: Add a **new regression test** (`R7`, `R8`...) in section 10, with a description of the original bug and verification steps.
3. **Small improvements** (new flag, edge case fix): Extend an **existing section** — add a checklist item to the relevant section (e.g., new edge case in section 9).
4. **Version bump**: Update the version number in section 0's install command: `translation-toolkit@X.Y.Z`.

---

## When Adding a New Command

Checklist (all steps required):

1. [ ] Create `lib/<command>.js` with a core function + `run<Command>()` CLI runner
2. [ ] Add case to `bin/translation-toolkit.js` — import + dispatch in `main()`
3. [ ] Add case to `bin/po-csv-tool.js` — same changes (legacy alias)
4. [ ] Add help text in `printHelp()` in **both** bin files
5. [ ] Create `test/<command>.test.js` with unit tests for the core function
6. [ ] Add CLI behavior tests using `execFileSync` if warranted
7. [ ] Add/update fixtures in `test/fixtures/` if the command needs test data
8. [ ] Add section to `test-prompt.md` with manual QA checklist
9. [ ] Update `CHANGELOG.md` — new version section + test counter
10. [ ] Bump `version` in `package.json`
11. [ ] Update `README.md` — usage examples, exit codes, options table

---

## When Adding a New Flag to an Existing Command

1. [ ] Add arg parsing in `run<Command>()` in `lib/<command>.js` (manual for-loop pattern)
2. [ ] Add to `printHelp()` in **both** `bin/translation-toolkit.js` and `bin/po-csv-tool.js`
3. [ ] Add tests covering the new flag
4. [ ] Update `CHANGELOG.md` and `test-prompt.md`
5. [ ] Update `README.md` options table

---

## File Format Quick Reference

### PO Files

```po
# Translator comment
#. Extracted comment
#: src/file.js:42
#, fuzzy
msgctxt "menu"
msgid "Save"
msgstr "Zapisz"
```

- Header block: `msgid ""` / `msgstr ""` with metadata lines (`Language`, `Plural-Forms`, `Content-Type`, `MIME-Version`)
- Filename convention: `{locale}.po` — `en-US.po`, `pl-PL.po`
- Short code extraction: `en-US` → `en`
- Multiline: empty `msgid`/`msgstr` followed by continuation lines (`"..."`)
- **Plural forms (`msgid_plural`, `msgstr[N]`) are NOT parsed** — silently skipped

### CSV Files

```
key|en|pl
simple.key|Simple value|Prosta wartość
menu::Save|Save|Zapisz
with.newlines|"First line\nSecond line"|"Pierwsza\nDruga"
```

- Delimiter: pipe `|` by default (configurable via `-D`)
- `msgctxt` keys use `::` — e.g., `menu::Save` (internal `\x04` → display `::`)
- Multi-line values wrapped in double quotes; internal quotes escaped as `""`
- Custom CSV parser in `parseCsvContent()` — handles quoted fields with embedded newlines

---

## Useful Commands

```bash
npm test                          # Run all tests
node bin/translation-toolkit.js --help   # Full CLI help
node bin/translation-toolkit.js export --dir test/fixtures -o /tmp/test.csv
node bin/translation-toolkit.js preview --dir test/fixtures --port 3456
```
