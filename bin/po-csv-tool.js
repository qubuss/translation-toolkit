#!/usr/bin/env node

/**
 * po-csv-tool — CLI for converting between .po translation files and CSV.
 *
 * Usage:
 *   po-csv-tool export [options]
 *   po-csv-tool import <file.csv> [options]
 *   po-csv-tool --help
 */

const { runExport } = require('../lib/export');
const { runImport } = require('../lib/import');
const { runPreview } = require('../lib/preview');
const { runValidate } = require('../lib/validate');
const { runStats } = require('../lib/stats');
const { runDiff } = require('../lib/diff');

const VERSION = require('../package.json').version;

function printHelp() {
  console.log(`
po-csv-tool v${VERSION}
Convert between .po translation files and pipe-delimited CSV.

USAGE
  po-csv-tool export [options]        Export .po files → CSV
  po-csv-tool import <file> [options] Import CSV → .po files
  po-csv-tool preview [options]       Preview translations in browser
  po-csv-tool validate [options]      Validate translations for issues
  po-csv-tool stats [options]         Show translation coverage statistics
  po-csv-tool diff <file> [file] [opt] Compare translations (CSV vs CSV or CSV vs .po)

EXPORT OPTIONS
  -o, --output <file>   Output CSV file path (default: translations.csv)
                        For --format json/i18next: output directory (default: .)
  -d, --dir <path>      Translations directory (default: auto-discover)
  -D, --delimiter <ch>  Column delimiter (default: |)
  -f, --format <fmt>    Output format: csv (default), json, or i18next
  --compat <ver>        i18next compatibility: 4 (default, CLDR) or 3 (legacy)
  --no-status           Omit _status column from CSV (fuzzy info)

IMPORT OPTIONS
  -m, --merge           Keep existing keys not in CSV (default: replace all)
  -n, --dry-run         Show what would change without modifying any files
  -d, --dir <path>      Translations directory (default: auto-discover)
  -D, --delimiter <ch>  Column delimiter (default: |)
  -f, --format <fmt>    Input format: csv (default), json, or i18next
  --compat <ver>        i18next compatibility: 4 (default, CLDR) or 3 (legacy)

PREVIEW OPTIONS
  -d, --dir <path>      Translations directory (default: auto-discover)
  -p, --port <number>   HTTP server port (default: 3456, auto-increments if busy)
  -w, --watch           Auto-reload when .po files change
  -s, --static          Generate standalone HTML file (no server needed)
  -o, --output <path>   Output file for --static (default: translation-preview.html)

VALIDATE OPTIONS
  -d, --dir <path>      Translations directory (default: auto-discover)
  --json                Output results as JSON (for CI/tooling integration)
  --severity <level>    Filter issues: "error" or "warning" (default: warning = all)
  --cross-format <fmt>  Compare .po keys against exported format: json or i18next
  --format-dir <path>   Directory with exported JSON/i18next files (required with --cross-format)
  --compat <ver>        i18next compatibility: 4 (default, CLDR) or 3 (legacy)

STATS OPTIONS
  -d, --dir <path>      Translations directory (default: auto-discover)

DIFF OPTIONS
  -d, --dir <path>      Translations directory (for CSV vs .po mode)
  -D, --delimiter <ch>  Column delimiter (default: |)
  --exit-zero           Always exit 0, even when differences are found
                        (useful for informational diff in CI pipelines)

GLOBAL OPTIONS
  --ci                  Non-interactive mode for CI/CD pipelines
                        (auto-selects first .po directory, never prompts)
  -h, --help            Show this help message
  -v, --version         Show version number

FILE FORMAT
  Output uses pipe (|) as column delimiter by default.
  Use -D to change: -D "," for comma-separated, -D "\t" for TSV.

EXIT CODES
  0                     Success (or: no differences for diff, no issues for validate)
  1                     Error, or: differences found (diff), validation errors (validate)

EXAMPLES
  po-csv-tool export
  po-csv-tool export -o translations.csv -d src/i18n
  po-csv-tool import translations.csv
  po-csv-tool import translations.csv --merge
  po-csv-tool import translations.csv --dry-run
  po-csv-tool import translations.csv -d locales/
  po-csv-tool preview
  po-csv-tool preview --port 8080 --watch
  po-csv-tool preview --static
  po-csv-tool preview --static -o docs/preview.html
  po-csv-tool validate
  po-csv-tool validate --dir src/i18n
  po-csv-tool validate --json
  po-csv-tool validate --severity error
  po-csv-tool validate --cross-format json --format-dir locales/json/ --dir src/i18n
  po-csv-tool validate --cross-format i18next --format-dir locales/ --dir src/i18n
  po-csv-tool stats
  po-csv-tool stats --dir src/i18n
  po-csv-tool diff old.csv new.csv
  po-csv-tool diff translations.csv
  po-csv-tool diff translations.csv --dir src/i18n
  po-csv-tool export --format json -o locales/
  po-csv-tool import --format json locales/ --dir src/i18n
  po-csv-tool export --format i18next -o locales/
  po-csv-tool export --format i18next --compat 3 -o locales/
  po-csv-tool import --format i18next locales/ --dir src/i18n

AUTO-DISCOVERY
  When --dir is not specified, the tool recursively searches the current
  directory for folders containing .po files (skipping node_modules, .git,
  dist, build, etc.). If multiple folders are found, you'll be prompted
  to choose one interactively.
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(VERSION);
    process.exit(0);
  }

  // --ci flag: non-interactive mode for CI/CD pipelines
  if (args.includes('--ci')) {
    process.env.TT_CI = '1';
  }

  const command = args[0];
  const commandArgs = args.slice(1).filter(a => a !== '--ci');

  if (command === 'export') {
    await runExport(commandArgs);
  } else if (command === 'import') {
    await runImport(commandArgs);
  } else if (command === 'preview') {
    await runPreview(commandArgs);
  } else if (command === 'validate') {
    await runValidate(commandArgs);
  } else if (command === 'stats') {
    await runStats(commandArgs);
  } else if (command === 'diff') {
    await runDiff(commandArgs);
  } else {
    console.error(`Unknown command: "${command}". Use --help for usage info.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
