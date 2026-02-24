#!/usr/bin/env node

/**
 * translation-toolkit — CLI for managing .po translation files.
 *
 * Usage:
 *   translation-toolkit export [options]
 *   translation-toolkit import <file.csv> [options]
 *   translation-toolkit --help
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
translation-toolkit v${VERSION}
Zero-dependency CLI toolkit for managing .po translation files.

USAGE
  translation-toolkit export [options]        Export .po files → CSV
  translation-toolkit import <file> [options] Import CSV → .po files
  translation-toolkit preview [options]       Preview translations in browser
  translation-toolkit validate [options]      Validate translations for issues
  translation-toolkit stats [options]         Show translation coverage statistics
  translation-toolkit diff <file> [file] [opt] Compare translations (CSV vs CSV or CSV vs .po)

EXPORT OPTIONS
  -o, --output <file>   Output CSV file path (default: translations.csv)
  -d, --dir <path>      Translations directory (default: auto-discover)
  -D, --delimiter <ch>  Column delimiter (default: |)
  --no-status           Omit _status column from CSV (fuzzy info)

IMPORT OPTIONS
  -m, --merge           Keep existing keys not in CSV (default: replace all)
  -n, --dry-run         Show what would change without modifying any files
  -d, --dir <path>      Translations directory (default: auto-discover)
  -D, --delimiter <ch>  Column delimiter (default: |)

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
  translation-toolkit export
  translation-toolkit export -o translations.csv -d src/i18n
  translation-toolkit import translations.csv
  translation-toolkit import translations.csv --merge
  translation-toolkit import translations.csv --dry-run
  translation-toolkit import translations.csv -d locales/
  translation-toolkit preview
  translation-toolkit preview --port 8080 --watch
  translation-toolkit preview --static
  translation-toolkit preview --static -o docs/preview.html
  translation-toolkit validate
  translation-toolkit validate --dir src/i18n
  translation-toolkit validate --json
  translation-toolkit validate --severity error
  translation-toolkit stats
  translation-toolkit stats --dir src/i18n
  translation-toolkit diff old.csv new.csv
  translation-toolkit diff translations.csv
  translation-toolkit diff translations.csv --dir src/i18n

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
