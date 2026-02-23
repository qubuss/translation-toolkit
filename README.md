# translation-toolkit

[![npm version](https://img.shields.io/npm/v/translation-toolkit)](https://www.npmjs.com/package/translation-toolkit)
[![license](https://img.shields.io/npm/l/translation-toolkit)](LICENSE)
[![node](https://img.shields.io/node/v/translation-toolkit)](package.json)

A zero-dependency CLI tool to convert between [GNU gettext `.po`](https://www.gnu.org/software/gettext/manual/html_node/PO-Files.html) translation files and pipe-delimited CSV.

**Export** all your `.po` files into a single CSV that's easy to edit in any spreadsheet app (Excel, Google Sheets, LibreOffice). **Import** the CSV back to update or create `.po` files — including new languages.

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Usage](#usage)
  - [Export](#export-po--csv)
  - [Import](#import-csv--po)
  - [Preview](#preview-browser)
  - [Validate](#validate-check-translations)
  - [Statistics](#statistics)
  - [Diff](#diff-compare-translations)
- [Auto-Discovery](#auto-discovery)
- [CSV Format](#csv-format)
- [CI/CD Integration](#cicd-integration)
- [Examples](#examples)
- [Typical Workflow](#typical-workflow)
- [Limitations](#limitations)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Zero dependencies** — pure Node.js, nothing to install
- **Auto-discovery** — finds `.po` files in your project automatically
- **Round-trip safe** — export → import produces identical `.po` files
- **New languages** — add a column to CSV, import creates the `.po` file with correct `Plural-Forms`
- **Merge mode** — update only changed keys without removing existing ones
- **Custom delimiter** — use `|`, `;`, `\t`, or any character
- **Browser preview** — view all translations in a searchable table at `localhost`
- **Static export** — generate a standalone HTML preview file for GitHub Pages / S3 / email
- **Inline editing** — click any cell in the preview to edit translations directly in the browser
- **Plural forms** — full `msgid_plural` / `msgstr[N]` support: export as `key[N]` rows, import back, validate nplurals, preview with badge
- **Validation** — check for missing keys, empty translations, variable mismatches, fuzzy entries, plural form consistency
- **Statistics** — per-language coverage reports with progress bars
- **Diff** — compare two CSV files or a CSV against current `.po` files
- **Fuzzy detection** — `#, fuzzy` entries highlighted in preview (yellow badge), counted in stats, warned in validate
- **Dark mode** — toggle between light and dark themes in the browser preview
- **Interactive** — if multiple `.po` directories exist, prompts you to choose

## Screenshots

### Translations tab

Browse, search, and inline-edit all translations in a single table.

![Translations tab](docs/screenshots/translations_screen.png)

### Validation tab

Spot missing keys, empty translations, and variable mismatches at a glance.

![Validation tab](docs/screenshots/validation_screen.png)

### Statistics tab

Per-language coverage bars, key counts, and top missing keys.

![Statistics tab](docs/screenshots/statistics_screen.png)

### Diff tab — CSV vs CSV

Compare two CSV exports side by side — see added, removed, and changed keys.

![Diff CSV vs CSV](docs/screenshots/diff_csv_csv.png)

### Diff tab — CSV vs .po

Compare a CSV against the current `.po` files to review pending changes.

![Diff CSV vs .po](docs/screenshots/diff_csv_po.png)

## Installation

```bash
# Use directly without installing (recommended)
npx translation-toolkit export

# Or install globally
npm install -g translation-toolkit
```

## Quick Start

```bash
# Export all .po files to CSV
npx translation-toolkit export

# Edit translations.csv in your favorite spreadsheet editor...

# Import CSV back into .po files
npx translation-toolkit import translations.csv
```

## Usage

### Export (`.po` → CSV)

```bash
translation-toolkit export [options]
```

| Option                 | Description            | Default            |
| ---------------------- | ---------------------- | ------------------ |
| `-o, --output <file>`  | Output CSV file path   | `translations.csv` |
| `-d, --dir <path>`     | Translations directory | auto-discover      |
| `-D, --delimiter <ch>` | Column delimiter       | `\|`               |

**Example output** (`translations.csv`):

```text
key|en|pl
mainMenu.send|Send packages|Wyślij przesyłki
mainMenu.help|Help|Pomoc
```

#### Plural forms in CSV

Plural entries are exported as separate `key[N]` rows — one per plural form:

```text
key|en|pl
1 file[0]|%d file|%d plik
1 file[1]|%d files|%d pliki
1 file[2]||%d plików
```

English has 2 forms (`[0]` singular, `[1]` plural). Polish has 3 forms. Empty cells are filled when a language has fewer forms. On import, `key[N]` rows are automatically grouped back into `msgid_plural` / `msgstr[N]` blocks.

### Import (CSV → `.po`)

```bash
translation-toolkit import <file.csv> [options]
```

| Option                 | Description                                  | Default       |
| ---------------------- | -------------------------------------------- | ------------- |
| `-m, --merge`          | Keep existing keys not present in CSV        | replace all   |
| `-n, --dry-run`        | Show what would change without writing files | off           |
| `-d, --dir <path>`     | Translations directory                       | auto-discover |
| `-D, --delimiter <ch>` | Column delimiter                             | `\|`          |

### Import modes

| Mode                  | Behavior                                                                       |
| --------------------- | ------------------------------------------------------------------------------ |
| **Replace** (default) | CSV is the source of truth. Keys not in CSV are removed from `.po`.            |
| **Merge** (`--merge`) | Existing `.po` keys are preserved. Only keys present in CSV are added/updated. |

### Adding a new language

Just add a column to the CSV:

```text
key|en|pl|cs
mainMenu.send|Send packages|Wyślij przesyłki|Odeslat balíky
```

On import, a new `cs-CZ.po` file is created automatically with the correct `Plural-Forms` header.

Supported locale mappings: `en`, `pl`, `cs`, `sk`, `de`, `fr`, `es`, `it`, `pt`, `nl`, `hu`, `ro`, `uk`, `ru`. Unknown codes produce `xx-XX.po` format.

### Preview (browser)

View all translations in an interactive table in your browser.

```bash
translation-toolkit preview [options]
```

| Option                | Description                                 | Default                          |
| --------------------- | ------------------------------------------- | -------------------------------- |
| `-d, --dir <path>`    | Translations directory                      | auto-discover                    |
| `-p, --port <number>` | HTTP server port                            | `3456`                           |
| `-w, --watch`         | Auto-reload on `.po` file changes           | off                              |
| `-s, --static`        | Generate a standalone HTML file (no server) | off                              |
| `-o, --output <path>` | Output file path (with `--static`)          | `translation-preview/index.html` |

If the requested port is in use, the server automatically tries the next port (up to 20 attempts).

Features of the preview page:

- **Tabs** — switch between Translations, Validation, Statistics, and Diff
- **Inline editing** — click any translation cell, edit it, and save back to `.po` files
- **Search** — filter keys and values in real time
- **Language filter** — show only a specific language column
- **Missing filter** — show only keys with missing translations
- **Counter** — shows how many keys match the current filter
- **Validation tab** — summary cards + filterable issue list with severity/type/language filters
- **Statistics tab** — per-language coverage bars, key counts, top missing keys
- **Diff tab** — upload CSV files to compare (CSV vs CSV or CSV vs current `.po`)
- **Dark mode** — toggle via the 🌙 button in the header (remembers your preference)
- **Save bar** — floating bar shows unsaved changes count with Save/Discard buttons
- **Watch mode** — `--watch` auto-reloads data when `.po` files change on disk (refresh browser to see updates)
- **Static export** — `--static` generates a self-contained HTML file with all data embedded (read-only, no server needed)

![Translations tab](docs/screenshots/translations_screen.png)

### Validate (check translations)

Check all `.po` files for common issues. Useful in CI pipelines (exits with code 1 on errors).

```bash
translation-toolkit validate [options]
```

| Option             | Description            | Default       |
| ------------------ | ---------------------- | ------------- |
| `-d, --dir <path>` | Translations directory | auto-discover |

Checks performed:

- **Missing keys** — key exists in reference language but not in target (error)
- **Extra keys** — key exists in target but not in reference language (warning)
- **Empty translations** — `msgstr` is empty (warning)
- **Variable mismatch** — `{{variables}}` differ between reference and target (error/warning)
- **Fuzzy entries** — `#, fuzzy` flag detected — translation needs review (warning)

The reference language is auto-detected as the one with the most keys (typically `en`).

![Validation tab](docs/screenshots/validation_screen.png)

### Statistics

Show translation coverage statistics per language.

```bash
translation-toolkit stats [options]
```

| Option             | Description            | Default       |
| ------------------ | ---------------------- | ------------- |
| `-d, --dir <path>` | Translations directory | auto-discover |

Shows for each language:

- **Coverage %** with colored progress bar
- **Translated / total** key counts
- **Empty, missing, extra** key counts
- **Top missing keys** (first 5)
- **Overall coverage** across all languages

![Statistics tab](docs/screenshots/statistics_screen.png)

### Diff (compare translations)

Compare two CSV exports or a CSV against the current `.po` files.

```bash
# Compare two CSV files
translation-toolkit diff old.csv new.csv

# Compare CSV against current .po files
translation-toolkit diff translations.csv
```

| Option                 | Description                                | Default       |
| ---------------------- | ------------------------------------------ | ------------- |
| `-d, --dir <path>`     | Translations directory (CSV vs `.po` mode) | auto-discover |
| `-D, --delimiter <ch>` | Column delimiter                           | `\|`          |
| `--exit-zero`          | Always exit 0 even if differences found    | off           |

Detects:

- **Added keys** — in new but not in old
- **Removed keys** — in old but not in new
- **Changed values** — same key, different translation (per-language)

Exits with code 1 if differences found (useful for CI). Use `--exit-zero` for informational diffs in pipelines.

![Diff CSV vs CSV](docs/screenshots/diff_csv_csv.png)

## Exit Codes

All commands exit with code 0 on success. Some commands use non-zero exit codes to signal specific conditions:

| Command    | Exit Code | Meaning                                           |
| ---------- | --------- | ------------------------------------------------- |
| `validate` | `1`       | Validation errors found                           |
| `diff`     | `1`       | Differences found (use `--exit-zero` to override) |
| Any        | `1`       | Fatal error (missing file, invalid input)         |

## Auto-Discovery

When `--dir` is not specified, the tool recursively searches the current working directory for folders containing `.po` files. It skips `node_modules`, `.git`, `dist`, `build`, and other common non-source directories.

- **1 folder found** → used automatically
- **Multiple folders** → interactive prompt:

  ```text
  Found .po files in multiple directories:

    [1] src/translations  (2 .po files)
    [2] locales/backend   (5 .po files)

  Pick a directory [1]:
  ```

- **No folders** → error with suggestion to use `--dir`

## CSV Format

- Default delimiter: `|` (pipe) — avoids conflicts with commas in translations
- First column is always `key` (the `msgid`)
- Language columns use short codes (`en`, `pl`, `cs`, ...)
- Fields containing the delimiter, `"`, or newlines are wrapped in double quotes
- Double quotes inside fields are escaped as `""`

## CI/CD Integration

Use the `--ci` flag for non-interactive mode. This prevents the tool from prompting when multiple `.po` directories are found — it auto-selects the first one instead.

```bash
# All commands support --ci
translation-toolkit validate --ci
translation-toolkit export --ci -o translations.csv
translation-toolkit import translations.csv --ci --dry-run
```

**Tip:** Always pass `--dir` explicitly in CI to avoid auto-discovery:

```bash
translation-toolkit validate --dir src/i18n
```

### GitHub Actions example

```yaml
name: Validate Translations
on: [push, pull_request]

jobs:
  translations:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install -g translation-toolkit
      - run: translation-toolkit validate --dir src/i18n --ci
      - run: translation-toolkit stats --dir src/i18n --ci
```

### Deploy static preview to GitHub Pages

Generate a standalone HTML preview and publish it as a build artifact or deploy to GitHub Pages:

```yaml
name: Translation Preview
on:
  push:
    branches: [main]

jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install -g translation-toolkit
      - run: translation-toolkit preview --dir src/i18n --static -o docs/preview.html
      - uses: actions/upload-pages-artifact@v3
        with:
          path: docs/
```

The generated file is fully self-contained — all data, styles, and scripts are embedded in a single HTML file. No server or additional assets required.

## Examples

```bash
# Export with semicolon delimiter
translation-toolkit export -D ";" -o translations.csv

# Import with merge (don't delete missing keys)
translation-toolkit import translations.csv --merge

# Preview what import will change (without writing files)
translation-toolkit import translations.csv --dry-run

# Specify directory explicitly
translation-toolkit export --dir src/i18n
translation-toolkit import translations.csv --dir src/i18n

# Use with npx from any project
cd my-project
npx translation-toolkit export

# Preview translations in browser (with editing, stats, diff, dark mode)
translation-toolkit preview
translation-toolkit preview --port 8080
translation-toolkit preview --watch

# Generate standalone HTML preview (for GitHub Pages, S3, email)
translation-toolkit preview --static
translation-toolkit preview --static -o docs/preview.html

# Validate translations (CI-friendly)
translation-toolkit validate
translation-toolkit validate --dir src/i18n

# Translation statistics
translation-toolkit stats
translation-toolkit stats --dir src/i18n

# Diff: compare two CSV snapshots
translation-toolkit diff old.csv new.csv

# Diff: compare CSV against current .po files
translation-toolkit diff translations.csv --dir src/i18n
```

## Typical Workflow

```bash
# 1. Check current coverage
translation-toolkit stats

# 2. Export current translations
translation-toolkit export -o translations.csv

# 3. Send CSV to translators or edit in a spreadsheet
#    (or use the browser preview for quick edits)
translation-toolkit preview

# 4. Import the updated CSV
translation-toolkit import translations.csv

# 5. Compare changes
translation-toolkit diff translations.csv

# 6. Validate before committing
translation-toolkit validate

# 7. Verify git changes
git diff src/translations/
```

## Limitations

- Plural forms in the browser preview are **read-only** (not editable via inline editing; edit via CSV round-trip instead)

## Roadmap

| Phase | Feature                                                   | Status  |
| ----- | --------------------------------------------------------- | ------- |
| 1     | Core CLI (export, import, preview, validate, stats, diff) | ✅ Done |
| 1.3   | DX improvements (dry-run, watch mode, port auto-detect)   | ✅ Done |
| 1.4   | CI/CD mode (`--ci` flag, non-interactive, exit codes)     | ✅ Done |
| 1.5   | Static preview export (`--static`) for GitHub Pages       | ✅ Done |
| 2     | Plural forms (`msgid_plural` / `msgstr[N]`)               | ✅ Done |
| 3     | Additional formats: JSON, XLIFF, Android XML              | Planned |
| 4     | Custom validation rules                                   | Planned |

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

For bugs or feature requests, please [open an issue](https://github.com/qubuss/translation-toolkit/issues).

## License

MIT — see [LICENSE](LICENSE) for details.
