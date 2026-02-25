/**
 * Tests for cross-format validation — crossFormatValidation().
 *
 * Verifies synchronization checks between .po and JSON/i18next exports:
 * - Missing/extra language files
 * - Missing/extra singular keys
 * - Missing/extra plural keys
 * - Value mismatches (stale exports)
 * - CLI integration (--cross-format, --format-dir, exit codes)
 *
 * Run: node --test test/crossFormat.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { crossFormatValidation } = require('../lib/validate');

const BIN = path.join(__dirname, '..', 'bin', 'translation-toolkit.js');
const TMP = path.join(__dirname, '.tmp-crossformat');

before(() => {
  fs.mkdirSync(TMP, { recursive: true });
});

after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Write a minimal .po file with given entries.
 */
function writePo(filePath, opts) {
  const lines = [];
  lines.push('msgid ""');
  lines.push('msgstr ""');
  lines.push(`"Language: ${opts.language}\\n"`);
  lines.push('"Content-Type: text/plain; charset=UTF-8\\n"');
  lines.push('"MIME-Version: 1.0\\n"');
  if (opts.pluralForms) {
    lines.push(`"Plural-Forms: ${opts.pluralForms}\\n"`);
  }
  lines.push('');

  for (const e of (opts.entries || [])) {
    if (e.flags) lines.push(`#, ${e.flags}`);
    if (e.msgctxt) lines.push(`msgctxt "${e.msgctxt}"`);
    lines.push(`msgid "${e.msgid}"`);
    lines.push(`msgstr "${e.msgstr}"`);
    lines.push('');
  }

  for (const p of (opts.plurals || [])) {
    if (p.flags) lines.push(`#, ${p.flags}`);
    if (p.msgctxt) lines.push(`msgctxt "${p.msgctxt}"`);
    lines.push(`msgid "${p.msgid}"`);
    lines.push(`msgid_plural "${p.msgid_plural}"`);
    for (let i = 0; i < p.msgstr.length; i++) {
      lines.push(`msgstr[${i}] "${p.msgstr[i]}"`);
    }
    lines.push('');
  }

  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
}

/**
 * Write a flat JSON file.
 */
function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Create a standard two-language test setup.
 * Returns { poDir, jsonDir } paths.
 */
function createTestSetup(name) {
  const poDir = path.join(TMP, name, 'po');
  const jsonDir = path.join(TMP, name, 'json');
  fs.mkdirSync(poDir, { recursive: true });
  fs.mkdirSync(jsonDir, { recursive: true });
  return { poDir, jsonDir };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('crossFormatValidation — JSON format', () => {

  describe('fully in sync', () => {
    it('returns no issues when .po and JSON are identical', () => {
      const { poDir, jsonDir } = createTestSetup('sync');

      writePo(path.join(poDir, 'en-US.po'), {
        language: 'en',
        entries: [
          { msgid: 'hello', msgstr: 'Hello' },
          { msgid: 'goodbye', msgstr: 'Goodbye' },
        ],
      });

      writePo(path.join(poDir, 'pl-PL.po'), {
        language: 'pl',
        entries: [
          { msgid: 'hello', msgstr: 'Cześć' },
          { msgid: 'goodbye', msgstr: 'Do widzenia' },
        ],
      });

      writeJson(path.join(jsonDir, 'en.json'), {
        hello: 'Hello',
        goodbye: 'Goodbye',
      });

      writeJson(path.join(jsonDir, 'pl.json'), {
        hello: 'Cześć',
        goodbye: 'Do widzenia',
      });

      const result = crossFormatValidation(poDir, jsonDir, 'json');
      assert.equal(result.issues.length, 0);
      assert.deepEqual(result.poLanguages, ['en', 'pl']);
      assert.deepEqual(result.formatLanguages, ['en', 'pl']);
    });
  });

  describe('missing keys in JSON', () => {
    it('reports error for key in .po but missing from JSON', () => {
      const { poDir, jsonDir } = createTestSetup('missing-key');

      writePo(path.join(poDir, 'en-US.po'), {
        language: 'en',
        entries: [
          { msgid: 'hello', msgstr: 'Hello' },
          { msgid: 'extra_po', msgstr: 'Extra from PO' },
        ],
      });

      writeJson(path.join(jsonDir, 'en.json'), {
        hello: 'Hello',
        // extra_po missing
      });

      const result = crossFormatValidation(poDir, jsonDir, 'json');
      const missing = result.issues.filter((i) => i.type === 'cross-format-missing-key');
      assert.equal(missing.length, 1);
      assert.equal(missing[0].severity, 'error');
      assert.equal(missing[0].key, 'extra_po');
      assert.equal(missing[0].lang, 'en');
    });
  });

  describe('extra keys in JSON', () => {
    it('reports warning for key in JSON but missing from .po', () => {
      const { poDir, jsonDir } = createTestSetup('extra-key');

      writePo(path.join(poDir, 'en-US.po'), {
        language: 'en',
        entries: [
          { msgid: 'hello', msgstr: 'Hello' },
        ],
      });

      writeJson(path.join(jsonDir, 'en.json'), {
        hello: 'Hello',
        orphan: 'Orphan key only in JSON',
      });

      const result = crossFormatValidation(poDir, jsonDir, 'json');
      const extra = result.issues.filter((i) => i.type === 'cross-format-extra-key');
      assert.equal(extra.length, 1);
      assert.equal(extra[0].severity, 'warning');
      assert.equal(extra[0].key, 'orphan');
    });
  });

  describe('value mismatches', () => {
    it('reports warning when values differ (stale export)', () => {
      const { poDir, jsonDir } = createTestSetup('value-mismatch');

      writePo(path.join(poDir, 'en-US.po'), {
        language: 'en',
        entries: [
          { msgid: 'hello', msgstr: 'Hello Updated' },
        ],
      });

      writeJson(path.join(jsonDir, 'en.json'), {
        hello: 'Hello Old',
      });

      const result = crossFormatValidation(poDir, jsonDir, 'json');
      const mismatches = result.issues.filter((i) => i.type === 'cross-format-value-mismatch');
      assert.equal(mismatches.length, 1);
      assert.equal(mismatches[0].severity, 'warning');
      assert.equal(mismatches[0].key, 'hello');
      assert.ok(mismatches[0].message.includes('Hello Updated'));
      assert.ok(mismatches[0].message.includes('Hello Old'));
    });
  });

  describe('missing language files', () => {
    it('reports error when .po language has no JSON file', () => {
      const { poDir, jsonDir } = createTestSetup('missing-lang');

      writePo(path.join(poDir, 'en-US.po'), {
        language: 'en',
        entries: [{ msgid: 'hello', msgstr: 'Hello' }],
      });

      writePo(path.join(poDir, 'de-DE.po'), {
        language: 'de',
        entries: [{ msgid: 'hello', msgstr: 'Hallo' }],
      });

      // Only en.json, no de.json
      writeJson(path.join(jsonDir, 'en.json'), { hello: 'Hello' });

      const result = crossFormatValidation(poDir, jsonDir, 'json');
      const missingLang = result.issues.filter((i) => i.type === 'cross-format-missing-lang');
      assert.equal(missingLang.length, 1);
      assert.equal(missingLang[0].lang, 'de');
      assert.equal(missingLang[0].severity, 'error');
    });
  });

  describe('extra language files', () => {
    it('reports warning when JSON language has no .po file', () => {
      const { poDir, jsonDir } = createTestSetup('extra-lang');

      writePo(path.join(poDir, 'en-US.po'), {
        language: 'en',
        entries: [{ msgid: 'hello', msgstr: 'Hello' }],
      });

      writeJson(path.join(jsonDir, 'en.json'), { hello: 'Hello' });
      writeJson(path.join(jsonDir, 'fr.json'), { hello: 'Bonjour' });

      const result = crossFormatValidation(poDir, jsonDir, 'json');
      const extraLang = result.issues.filter((i) => i.type === 'cross-format-extra-lang');
      assert.equal(extraLang.length, 1);
      assert.equal(extraLang[0].lang, 'fr');
      assert.equal(extraLang[0].severity, 'warning');
    });
  });

  describe('plural entries', () => {
    it('reports no issues when plural forms are in sync', () => {
      const { poDir, jsonDir } = createTestSetup('plural-sync');

      writePo(path.join(poDir, 'en-US.po'), {
        language: 'en',
        pluralForms: 'nplurals=2; plural=(n != 1);',
        entries: [],
        plurals: [
          { msgid: '%d file', msgid_plural: '%d files', msgstr: ['%d file', '%d files'] },
        ],
      });

      writeJson(path.join(jsonDir, 'en.json'), {
        '%d file': ['%d file', '%d files'],
      });

      const result = crossFormatValidation(poDir, jsonDir, 'json');
      const pluralIssues = result.issues.filter((i) => i.type.includes('plural'));
      assert.equal(pluralIssues.length, 0);
    });

    it('reports error for missing plural key in JSON', () => {
      const { poDir, jsonDir } = createTestSetup('plural-missing');

      writePo(path.join(poDir, 'en-US.po'), {
        language: 'en',
        pluralForms: 'nplurals=2; plural=(n != 1);',
        entries: [{ msgid: 'hello', msgstr: 'Hello' }],
        plurals: [
          { msgid: '%d file', msgid_plural: '%d files', msgstr: ['%d file', '%d files'] },
        ],
      });

      writeJson(path.join(jsonDir, 'en.json'), {
        hello: 'Hello',
        // plural key missing
      });

      const result = crossFormatValidation(poDir, jsonDir, 'json');
      const missingPlural = result.issues.filter((i) => i.type === 'cross-format-missing-plural');
      assert.equal(missingPlural.length, 1);
      assert.equal(missingPlural[0].key, '%d file');
    });

    it('reports warning for extra plural key in JSON', () => {
      const { poDir, jsonDir } = createTestSetup('plural-extra');

      writePo(path.join(poDir, 'en-US.po'), {
        language: 'en',
        pluralForms: 'nplurals=2; plural=(n != 1);',
        entries: [{ msgid: 'hello', msgstr: 'Hello' }],
        plurals: [],
      });

      writeJson(path.join(jsonDir, 'en.json'), {
        hello: 'Hello',
        '%d file': ['%d file', '%d files'],
      });

      const result = crossFormatValidation(poDir, jsonDir, 'json');
      const extraPlural = result.issues.filter((i) => i.type === 'cross-format-extra-plural');
      assert.equal(extraPlural.length, 1);
    });

    it('reports warning when plural form counts differ', () => {
      const { poDir, jsonDir } = createTestSetup('plural-mismatch');

      writePo(path.join(poDir, 'pl-PL.po'), {
        language: 'pl',
        pluralForms: 'nplurals=3; plural=(n==1 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);',
        entries: [],
        plurals: [
          { msgid: '%d file', msgid_plural: '%d files', msgstr: ['%d plik', '%d pliki', '%d plików'] },
        ],
      });

      // JSON only has 2 forms instead of 3
      writeJson(path.join(jsonDir, 'pl.json'), {
        '%d file': ['%d plik', '%d pliki'],
      });

      const result = crossFormatValidation(poDir, jsonDir, 'json');
      const mismatch = result.issues.filter((i) => i.type === 'cross-format-plural-mismatch');
      assert.equal(mismatch.length, 1);
      assert.ok(mismatch[0].message.includes('3 forms'));
      assert.ok(mismatch[0].message.includes('2 forms'));
    });
  });

  describe('msgctxt keys', () => {
    it('correctly handles context-prefixed keys with \\x04 separator', () => {
      const { poDir, jsonDir } = createTestSetup('msgctxt');

      writePo(path.join(poDir, 'en-US.po'), {
        language: 'en',
        entries: [
          { msgid: 'Open', msgstr: 'Open', msgctxt: 'menu' },
          { msgid: 'Open', msgstr: 'Open file', msgctxt: 'button' },
        ],
      });

      writeJson(path.join(jsonDir, 'en.json'), {
        'menu::Open': 'Open',
        'button::Open': 'Open file',
      });

      const result = crossFormatValidation(poDir, jsonDir, 'json');
      assert.equal(result.issues.length, 0);
    });

    it('detects missing context key in JSON', () => {
      const { poDir, jsonDir } = createTestSetup('msgctxt-missing');

      writePo(path.join(poDir, 'en-US.po'), {
        language: 'en',
        entries: [
          { msgid: 'Open', msgstr: 'Open', msgctxt: 'menu' },
          { msgid: 'Open', msgstr: 'Open file', msgctxt: 'button' },
        ],
      });

      writeJson(path.join(jsonDir, 'en.json'), {
        'menu::Open': 'Open',
        // button::Open missing
      });

      const result = crossFormatValidation(poDir, jsonDir, 'json');
      const missing = result.issues.filter((i) => i.type === 'cross-format-missing-key');
      assert.equal(missing.length, 1);
      assert.ok(missing[0].message.includes('button::Open'));
    });
  });

  describe('empty .po directory', () => {
    it('returns empty result for empty directory', () => {
      const { poDir, jsonDir } = createTestSetup('empty');

      const result = crossFormatValidation(poDir, jsonDir, 'json');
      assert.equal(result.issues.length, 0);
      assert.equal(result.poLanguages.length, 0);
    });
  });

  describe('multi-language combined issues', () => {
    it('reports issues per language independently', () => {
      const { poDir, jsonDir } = createTestSetup('multi-lang');

      writePo(path.join(poDir, 'en-US.po'), {
        language: 'en',
        entries: [
          { msgid: 'hello', msgstr: 'Hello' },
          { msgid: 'world', msgstr: 'World' },
        ],
      });

      writePo(path.join(poDir, 'pl-PL.po'), {
        language: 'pl',
        entries: [
          { msgid: 'hello', msgstr: 'Cześć' },
          { msgid: 'world', msgstr: 'Świat' },
        ],
      });

      // en.json missing 'world', pl.json has extra 'orphan'
      writeJson(path.join(jsonDir, 'en.json'), {
        hello: 'Hello',
      });

      writeJson(path.join(jsonDir, 'pl.json'), {
        hello: 'Cześć',
        world: 'Świat',
        orphan: 'Sierota',
      });

      const result = crossFormatValidation(poDir, jsonDir, 'json');

      const enMissing = result.issues.filter((i) => i.lang === 'en' && i.type === 'cross-format-missing-key');
      assert.equal(enMissing.length, 1);
      assert.equal(enMissing[0].key, 'world');

      const plExtra = result.issues.filter((i) => i.lang === 'pl' && i.type === 'cross-format-extra-key');
      assert.equal(plExtra.length, 1);
      assert.equal(plExtra[0].key, 'orphan');
    });
  });

  describe('issue sorting', () => {
    it('sorts errors before warnings, then by lang, then by key', () => {
      const { poDir, jsonDir } = createTestSetup('sorting');

      writePo(path.join(poDir, 'en-US.po'), {
        language: 'en',
        entries: [
          { msgid: 'alpha', msgstr: 'Alpha' },
          { msgid: 'beta', msgstr: 'Beta' },
        ],
      });

      // JSON: alpha value mismatch (warning), beta missing (will show as extra in json)
      writeJson(path.join(jsonDir, 'en.json'), {
        alpha: 'Alpha Changed',
        // beta missing → error
        gamma: 'Extra',
      });

      const result = crossFormatValidation(poDir, jsonDir, 'json');

      // errors should come first (missing key)
      const firstError = result.issues.findIndex((i) => i.severity === 'error');
      const lastError = result.issues.findLastIndex((i) => i.severity === 'error');
      const firstWarning = result.issues.findIndex((i) => i.severity === 'warning');

      if (firstWarning !== -1 && lastError !== -1) {
        assert.ok(lastError < firstWarning, 'errors should come before warnings');
      }
    });
  });
});

describe('crossFormatValidation — i18next format', () => {

  it('reports no issues when i18next v4 export is in sync', () => {
    const { poDir } = createTestSetup('i18next-sync');
    const i18nextDir = path.join(TMP, 'i18next-sync', 'i18next');
    fs.mkdirSync(i18nextDir, { recursive: true });

    writePo(path.join(poDir, 'en-US.po'), {
      language: 'en',
      pluralForms: 'nplurals=2; plural=(n != 1);',
      entries: [
        { msgid: 'hello', msgstr: 'Hello' },
      ],
      plurals: [
        { msgid: '%d item', msgid_plural: '%d items', msgstr: ['%d item', '%d items'] },
      ],
    });

    // i18next v4 format: singular as-is, plurals with CLDR suffixes
    writeJson(path.join(i18nextDir, 'en.json'), {
      hello: 'Hello',
      '%d item_one': '%d item',
      '%d item_other': '%d items',
    });

    const result = crossFormatValidation(poDir, i18nextDir, 'i18next', 4);
    assert.equal(result.issues.length, 0);
  });

  it('detects missing key in i18next export', () => {
    const { poDir } = createTestSetup('i18next-missing');
    const i18nextDir = path.join(TMP, 'i18next-missing', 'i18next');
    fs.mkdirSync(i18nextDir, { recursive: true });

    writePo(path.join(poDir, 'en-US.po'), {
      language: 'en',
      entries: [
        { msgid: 'hello', msgstr: 'Hello' },
        { msgid: 'goodbye', msgstr: 'Goodbye' },
      ],
    });

    writeJson(path.join(i18nextDir, 'en.json'), {
      hello: 'Hello',
    });

    const result = crossFormatValidation(poDir, i18nextDir, 'i18next', 4);
    const missing = result.issues.filter((i) => i.type === 'cross-format-missing-key');
    assert.equal(missing.length, 1);
    assert.equal(missing[0].key, 'goodbye');
  });
});

describe('crossFormatValidation — fixtures', () => {

  it('reports no issues for fixtures/json vs fixtures .po (in-sync reference)', () => {
    const poDir = path.join(__dirname, 'fixtures');
    const jsonDir = path.join(__dirname, 'fixtures', 'json');
    const result = crossFormatValidation(poDir, jsonDir, 'json');
    assert.equal(result.issues.length, 0,
      'Reference fixture JSON should be perfectly in sync with .po. Issues: ' +
      JSON.stringify(result.issues.map((i) => `${i.type}:${i.lang}:${i.key}`)));
  });

  it('reports no issues for fixtures/i18next vs fixtures .po (in-sync reference)', () => {
    const poDir = path.join(__dirname, 'fixtures');
    const i18nextDir = path.join(__dirname, 'fixtures', 'i18next');
    const result = crossFormatValidation(poDir, i18nextDir, 'i18next', 4);
    assert.equal(result.issues.length, 0,
      'Reference fixture i18next should be perfectly in sync with .po. Issues: ' +
      JSON.stringify(result.issues.map((i) => `${i.type}:${i.lang}:${i.key}`)));
  });

  it('reports no issues for integration-project/json (3 languages)', () => {
    const poDir = path.join(__dirname, 'integration-project', 'translations');
    const jsonDir = path.join(__dirname, 'integration-project', 'json');
    const result = crossFormatValidation(poDir, jsonDir, 'json');
    assert.equal(result.issues.length, 0,
      'Integration project JSON should be in sync. Issues: ' +
      JSON.stringify(result.issues.map((i) => `${i.type}:${i.lang}:${i.key}`)));
  });

  it('reports no issues for integration-project/i18next (3 languages)', () => {
    const poDir = path.join(__dirname, 'integration-project', 'translations');
    const i18nextDir = path.join(__dirname, 'integration-project', 'i18next');
    const result = crossFormatValidation(poDir, i18nextDir, 'i18next', 4);
    assert.equal(result.issues.length, 0,
      'Integration project i18next should be in sync. Issues: ' +
      JSON.stringify(result.issues.map((i) => `${i.type}:${i.lang}:${i.key}`)));
  });
});

describe('crossFormatValidation — CLI integration', () => {

  it('exits 0 when --cross-format finds no issues', () => {
    const { poDir, jsonDir } = createTestSetup('cli-ok');

    writePo(path.join(poDir, 'en-US.po'), {
      language: 'en',
      entries: [{ msgid: 'hello', msgstr: 'Hello' }],
    });

    writeJson(path.join(jsonDir, 'en.json'), { hello: 'Hello' });

    const output = execFileSync('node', [
      BIN, 'validate',
      '--dir', poDir,
      '--cross-format', 'json',
      '--format-dir', jsonDir,
    ], { encoding: 'utf-8' });

    assert.ok(output.includes('in sync'), 'Should report in sync');
  });

  it('exits 1 when --cross-format finds errors', () => {
    const { poDir, jsonDir } = createTestSetup('cli-error');

    writePo(path.join(poDir, 'en-US.po'), {
      language: 'en',
      entries: [
        { msgid: 'hello', msgstr: 'Hello' },
        { msgid: 'missing_from_json', msgstr: 'Missing' },
      ],
    });

    writeJson(path.join(jsonDir, 'en.json'), { hello: 'Hello' });

    let exitCode = 0;
    try {
      execFileSync('node', [
        BIN, 'validate',
        '--dir', poDir,
        '--cross-format', 'json',
        '--format-dir', jsonDir,
      ], { encoding: 'utf-8' });
    } catch (err) {
      exitCode = err.status;
    }

    assert.equal(exitCode, 1, 'Should exit with code 1 for cross-format errors');
  });

  it('--json includes crossFormat section in output', () => {
    const { poDir, jsonDir } = createTestSetup('cli-json');

    writePo(path.join(poDir, 'en-US.po'), {
      language: 'en',
      entries: [
        { msgid: 'hello', msgstr: 'Hello' },
        { msgid: 'extra_po', msgstr: 'Extra' },
      ],
    });

    writeJson(path.join(jsonDir, 'en.json'), { hello: 'Hello' });

    let output;
    try {
      output = execFileSync('node', [
        BIN, 'validate',
        '--dir', poDir,
        '--cross-format', 'json',
        '--format-dir', jsonDir,
        '--json',
      ], { encoding: 'utf-8' });
    } catch (err) {
      output = err.stdout;
    }

    const parsed = JSON.parse(output);
    assert.ok(parsed.crossFormat, 'JSON output should have crossFormat section');
    assert.equal(parsed.crossFormat.format, 'json');
    assert.ok(parsed.crossFormat.errors.length >= 1, 'Should have at least 1 cross-format error');
    assert.ok(parsed.crossFormat.summary, 'Should have crossFormat summary');
  });

  it('errors when --cross-format used without --format-dir', () => {
    const { poDir } = createTestSetup('cli-no-dir');

    writePo(path.join(poDir, 'en-US.po'), {
      language: 'en',
      entries: [{ msgid: 'hello', msgstr: 'Hello' }],
    });

    let exitCode = 0;
    let stderr = '';
    try {
      execFileSync('node', [
        BIN, 'validate',
        '--dir', poDir,
        '--cross-format', 'json',
      ], { encoding: 'utf-8' });
    } catch (err) {
      exitCode = err.status;
      stderr = err.stderr || '';
    }

    assert.equal(exitCode, 1);
    assert.ok(stderr.includes('--format-dir'));
  });

  it('errors when --cross-format has invalid format', () => {
    const { poDir, jsonDir } = createTestSetup('cli-bad-format');

    writePo(path.join(poDir, 'en-US.po'), {
      language: 'en',
      entries: [{ msgid: 'hello', msgstr: 'Hello' }],
    });

    let exitCode = 0;
    let stderr = '';
    try {
      execFileSync('node', [
        BIN, 'validate',
        '--dir', poDir,
        '--cross-format', 'yaml',
        '--format-dir', jsonDir,
      ], { encoding: 'utf-8' });
    } catch (err) {
      exitCode = err.status;
      stderr = err.stderr || '';
    }

    assert.equal(exitCode, 1);
    assert.ok(stderr.includes('json') || stderr.includes('i18next'));
  });

  it('--severity error filters cross-format warnings', () => {
    const { poDir, jsonDir } = createTestSetup('cli-severity');

    writePo(path.join(poDir, 'en-US.po'), {
      language: 'en',
      entries: [{ msgid: 'hello', msgstr: 'Hello' }],
    });

    // Value mismatch (warning) only, no missing keys
    writeJson(path.join(jsonDir, 'en.json'), {
      hello: 'Hello Old',
    });

    // With --severity error, the warning should be filtered out → exit 0
    const output = execFileSync('node', [
      BIN, 'validate',
      '--dir', poDir,
      '--cross-format', 'json',
      '--format-dir', jsonDir,
      '--severity', 'error',
    ], { encoding: 'utf-8' });

    assert.ok(output, 'Should produce output without crashing');
  });
});
