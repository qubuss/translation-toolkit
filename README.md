# translation-toolkit

[![npm version](https://img.shields.io/npm/v/translation-toolkit)](https://www.npmjs.com/package/translation-toolkit)
[![license](https://img.shields.io/npm/l/translation-toolkit)](LICENSE)
[![node](https://img.shields.io/node/v/translation-toolkit)](package.json)

A zero-dependency CLI tool to convert between [GNU gettext `.po`](https://www.gnu.org/software/gettext/manual/html_node/PO-Files.html) translation files and pipe-delimited CSV.

**Export** all your `.po` files into a single CSV that's easy to edit in any spreadsheet app (Excel, Google Sheets, LibreOffice). **Import** the CSV back to update or create `.po` files — including new languages.

## Table of Contents

- [Features](#features)
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
- **Inline editing** — click any cell in the preview to edit translations directly in the browser
- **Validation** — check for missing keys, empty translations, variable mismatches
- **Statistics** — per-language coverage reports with progress bars
- **Diff** — compare two CSV files or a CSV against current `.po` files
- **Dark mode** — toggle between light and dark themes in the browser preview
- **Interactive** — if multiple `.po` directories exist, prompts you to choose

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

### Import (CSV → `.po`)

```bash
translation-toolkit import <file.csv> [options]
```

| Option                 | Description                           | Default       |
| ---------------------- | ------------------------------------- | ------------- |
| `-m, --merge`          | Keep existing keys not present in CSV | replace all   |
| `-d, --dir <path>`     | Translations directory                | auto-discover |
| `-D, --delimiter <ch>` | Column delimiter                      | `\|`          |

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

| Option                | Description            | Default       |
| --------------------- | ---------------------- | ------------- |
| `-d, --dir <path>`    | Translations directory | auto-discover |
| `-p, --port <number>` | HTTP server port       | `3456`        |

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

The reference language is auto-detected as the one with the most keys (typically `en`).

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

Detects:

- **Added keys** — in new but not in old
- **Removed keys** — in old but not in new
- **Changed values** — same key, different translation (per-language)

Exits with code 1 if differences found (useful for CI).

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

## Examples

```bash
# Export with semicolon delimiter
translation-toolkit export -D ";" -o translations.csv

# Import with merge (don't delete missing keys)
translation-toolkit import translations.csv --merge

# Specify directory explicitly
translation-toolkit export --dir src/i18n
translation-toolkit import translations.csv --dir src/i18n

# Use with npx from any project
cd my-project
npx translation-toolkit export

# Preview translations in browser (with editing, stats, diff, dark mode)
translation-toolkit preview
translation-toolkit preview --port 8080

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

- Only supports simple `msgid`/`msgstr` pairs (no plural forms `msgid_plural`/`msgstr[N]` — coming in v1.2)

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
