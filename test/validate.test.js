/**
 * Tests for validate.js — validateTranslations() core function.
 *
 * Covers both singular and plural validation logic:
 * - missing-key, extra-key, empty-translation, variable-mismatch (singular)
 * - nplurals-mismatch, empty-plural-form, missing-plural-key, extra-plural-key,
 *   variable-mismatch in plural forms (plural)
 *
 * Run: node --test test/validate.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { validateTranslations } = require('../lib/validate');

const FIXTURES = path.join(__dirname, 'fixtures');
const TMP = path.join(__dirname, '.tmp-validate');

before(() => {
  fs.mkdirSync(TMP, { recursive: true });
});

after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

// ── Helper: write minimal .po file ────────────────────────

/**
 * Write a .po file with a header and entries.
 * @param {string} filePath
 * @param {object} opts
 * @param {string} opts.language
 * @param {string} [opts.pluralForms]
 * @param {Array<{msgid: string, msgstr: string, msgctxt?: string, flags?: string}>} [opts.entries]
 * @param {Array<{msgid: string, msgid_plural: string, msgstr: string[], msgctxt?: string, flags?: string}>} [opts.plurals]
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

// ─── Fixtures validation ─────────────────────────────────

describe('validateTranslations — fixtures', () => {
  it('returns correct languages and refLang from fixtures', () => {
    const result = validateTranslations(FIXTURES);
    assert.ok(result.languages.includes('en'), 'should include en');
    assert.ok(result.languages.includes('pl'), 'should include pl');
    assert.equal(result.refLang, 'en', 'en should be reference language (most keys)');
  });

  it('returns totalKeys count for singular entries', () => {
    const result = validateTranslations(FIXTURES);
    assert.ok(result.totalKeys >= 50, `should have at least 50 singular keys, got ${result.totalKeys}`);
  });

  it('returns totalPluralKeys count', () => {
    const result = validateTranslations(FIXTURES);
    assert.equal(result.totalPluralKeys, 4, 'fixtures have 4 plural entries');
  });

  it('has no empty plural form issues in fixtures (multi-line forms are not empty)', () => {
    const result = validateTranslations(FIXTURES);
    const emptyPluralIssues = result.issues.filter(
      (i) => i.type === 'empty-plural-form'
    );
    // All plural forms in fixtures are filled (multi-line msgstr is not empty)
    assert.equal(emptyPluralIssues.length, 0, `fixtures should have 0 empty plural forms, got ${emptyPluralIssues.length}`);
  });
});

// ─── Empty directory ──────────────────────────────────────

describe('validateTranslations — empty directory', () => {
  it('returns empty result for directory with no .po files', () => {
    const emptyDir = path.join(TMP, 'empty');
    fs.mkdirSync(emptyDir, { recursive: true });
    const result = validateTranslations(emptyDir);
    assert.deepEqual(result.issues, []);
    assert.equal(result.refLang, '');
    assert.equal(result.totalKeys, 0);
  });
});

// ─── Singular validation ──────────────────────────────────

describe('validateTranslations — singular issues', () => {
  const dir = path.join(TMP, 'singular');

  before(() => {
    fs.mkdirSync(dir, { recursive: true });
    writePo(path.join(dir, 'en-US.po'), {
      language: 'en',
      entries: [
        { msgid: 'hello', msgstr: 'Hello' },
        { msgid: 'bye', msgstr: 'Goodbye' },
        { msgid: 'empty.ref', msgstr: '' },
        { msgid: 'var.test', msgstr: 'Hello {{name}}, you have {{count}} items' },
      ],
    });
    writePo(path.join(dir, 'pl-PL.po'), {
      language: 'pl',
      entries: [
        { msgid: 'hello', msgstr: 'Cześć' },
        // bye is missing
        { msgid: 'empty.pl', msgstr: '' },
        { msgid: 'extra.key', msgstr: 'Extra' },
        { msgid: 'var.test', msgstr: 'Cześć {{name}}' }, // missing {{count}}
      ],
    });
  });

  it('detects missing keys', () => {
    const result = validateTranslations(dir);
    const missing = result.issues.filter((i) => i.type === 'missing-key' && i.lang === 'pl');
    const keys = missing.map((i) => i.key);
    assert.ok(keys.includes('bye'), 'should detect "bye" missing in pl');
    assert.ok(keys.includes('empty.ref'), 'should detect "empty.ref" missing in pl');
  });

  it('detects extra keys', () => {
    const result = validateTranslations(dir);
    const extra = result.issues.filter((i) => i.type === 'extra-key' && i.lang === 'pl');
    const keys = extra.map((i) => i.key);
    assert.ok(keys.includes('extra.key'), 'should detect "extra.key" as extra in pl');
  });

  it('detects empty translations', () => {
    const result = validateTranslations(dir);
    const empty = result.issues.filter((i) => i.type === 'empty-translation');
    assert.ok(
      empty.some((i) => i.lang === 'en' && i.key === 'empty.ref'),
      'should detect empty ref translation'
    );
    assert.ok(
      empty.some((i) => i.lang === 'pl' && i.key === 'empty.pl'),
      'should detect empty pl translation'
    );
  });

  it('detects variable mismatch — missing variable', () => {
    const result = validateTranslations(dir);
    const varIssues = result.issues.filter(
      (i) => i.type === 'variable-mismatch' && i.key === 'var.test' && i.severity === 'error'
    );
    assert.ok(varIssues.length > 0, 'should detect missing {{count}} in pl');
    assert.ok(varIssues[0].message.includes('{{count}}'), 'message should mention {{count}}');
  });

  it('errors are sorted before warnings', () => {
    const result = validateTranslations(dir);
    const firstWarning = result.issues.findIndex((i) => i.severity === 'warning');
    const lastError = result.issues.findLastIndex((i) => i.severity === 'error');
    if (lastError >= 0 && firstWarning >= 0) {
      assert.ok(lastError < firstWarning, 'all errors should come before all warnings');
    }
  });
});

// ─── Plural validation: nplurals mismatch ─────────────────

describe('validateTranslations — nplurals mismatch', () => {
  const dir = path.join(TMP, 'nplurals-mismatch');

  before(() => {
    fs.mkdirSync(dir, { recursive: true });
    writePo(path.join(dir, 'en-US.po'), {
      language: 'en',
      pluralForms: 'nplurals=2; plural=(n != 1)',
      entries: [{ msgid: 'filler', msgstr: 'filler' }],
      plurals: [
        { msgid: '%d cat', msgid_plural: '%d cats', msgstr: ['%d cat', '%d cats'] },
      ],
    });
    // pl declares nplurals=3 but only provides 2 forms
    writePo(path.join(dir, 'pl-PL.po'), {
      language: 'pl',
      pluralForms: 'nplurals=3; plural=(n==1 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2)',
      entries: [{ msgid: 'filler', msgstr: 'wypełniacz' }],
      plurals: [
        { msgid: '%d cat', msgid_plural: '%d cats', msgstr: ['%d kot', '%d koty'] }, // only 2, should be 3
      ],
    });
  });

  it('detects nplurals header vs form count mismatch', () => {
    const result = validateTranslations(dir);
    const mismatch = result.issues.filter(
      (i) => i.type === 'nplurals-mismatch' && i.lang === 'pl'
    );
    assert.ok(mismatch.length > 0, 'should detect nplurals mismatch in pl');
    assert.ok(mismatch[0].message.includes('has 2 forms'), 'should report 2 forms');
    assert.ok(mismatch[0].message.includes('nplurals=3'), 'should report expected nplurals=3');
  });

  it('no nplurals mismatch when form count matches', () => {
    const result = validateTranslations(dir);
    const enMismatch = result.issues.filter(
      (i) => i.type === 'nplurals-mismatch' && i.lang === 'en'
    );
    assert.equal(enMismatch.length, 0, 'en has 2 forms matching nplurals=2');
  });
});

// ─── Plural validation: empty plural forms ────────────────

describe('validateTranslations — empty plural forms', () => {
  const dir = path.join(TMP, 'empty-plural');

  before(() => {
    fs.mkdirSync(dir, { recursive: true });
    writePo(path.join(dir, 'en-US.po'), {
      language: 'en',
      pluralForms: 'nplurals=2; plural=(n != 1)',
      entries: [{ msgid: 'filler', msgstr: 'filler' }],
      plurals: [
        { msgid: '%d dog', msgid_plural: '%d dogs', msgstr: ['%d dog', ''] }, // empty form[1]
      ],
    });
    writePo(path.join(dir, 'pl-PL.po'), {
      language: 'pl',
      pluralForms: 'nplurals=3; plural=(n==1 ? 0 : 2)',
      entries: [{ msgid: 'filler', msgstr: 'wypełniacz' }],
      plurals: [
        { msgid: '%d dog', msgid_plural: '%d dogs', msgstr: ['', '%d psy', ''] }, // empty form[0] and [2]
      ],
    });
  });

  it('detects empty plural forms in reference language', () => {
    const result = validateTranslations(dir);
    const emptyRef = result.issues.filter(
      (i) => i.type === 'empty-plural-form' && i.lang === 'en'
    );
    assert.equal(emptyRef.length, 1, 'en has 1 empty plural form');
    assert.ok(emptyRef[0].message.includes('[1]'), 'should identify form [1]');
  });

  it('detects empty plural forms in target language', () => {
    const result = validateTranslations(dir);
    const emptyPl = result.issues.filter(
      (i) => i.type === 'empty-plural-form' && i.lang === 'pl'
    );
    assert.equal(emptyPl.length, 2, 'pl has 2 empty plural forms');
  });
});

// ─── Plural validation: missing / extra plural keys ───────

describe('validateTranslations — missing and extra plural keys', () => {
  const dir = path.join(TMP, 'plural-keys');

  before(() => {
    fs.mkdirSync(dir, { recursive: true });
    writePo(path.join(dir, 'en-US.po'), {
      language: 'en',
      pluralForms: 'nplurals=2; plural=(n != 1)',
      entries: [{ msgid: 'filler', msgstr: 'filler' }],
      plurals: [
        { msgid: '%d apple', msgid_plural: '%d apples', msgstr: ['%d apple', '%d apples'] },
        { msgid: '%d orange', msgid_plural: '%d oranges', msgstr: ['%d orange', '%d oranges'] },
      ],
    });
    writePo(path.join(dir, 'pl-PL.po'), {
      language: 'pl',
      pluralForms: 'nplurals=3; plural=(n==1 ? 0 : 2)',
      entries: [{ msgid: 'filler', msgstr: 'wypełniacz' }],
      plurals: [
        // apple present, orange missing
        { msgid: '%d apple', msgid_plural: '%d apples', msgstr: ['%d jabłko', '%d jabłka', '%d jabłek'] },
        // extra entry not in en
        { msgid: '%d banana', msgid_plural: '%d bananas', msgstr: ['%d banan', '%d banany', '%d bananów'] },
      ],
    });
  });

  it('detects missing plural keys', () => {
    const result = validateTranslations(dir);
    const missing = result.issues.filter(
      (i) => i.type === 'missing-plural-key' && i.lang === 'pl'
    );
    assert.equal(missing.length, 1, 'pl should miss 1 plural key');
    assert.ok(missing[0].key.includes('%d orange'), 'missing key should be %d orange');
  });

  it('detects extra plural keys', () => {
    const result = validateTranslations(dir);
    const extra = result.issues.filter(
      (i) => i.type === 'extra-plural-key' && i.lang === 'pl'
    );
    assert.equal(extra.length, 1, 'pl should have 1 extra plural key');
    assert.ok(extra[0].key.includes('%d banana'), 'extra key should be %d banana');
  });

  it('returns correct totalPluralKeys', () => {
    const result = validateTranslations(dir);
    assert.equal(result.totalPluralKeys, 2, 'reference has 2 plural entries');
  });
});

// ─── Plural validation: variable mismatch in plural forms ─

describe('validateTranslations — plural variable mismatch', () => {
  const dir = path.join(TMP, 'plural-vars');

  before(() => {
    fs.mkdirSync(dir, { recursive: true });
    writePo(path.join(dir, 'en-US.po'), {
      language: 'en',
      pluralForms: 'nplurals=2; plural=(n != 1)',
      entries: [{ msgid: 'filler', msgstr: 'filler' }],
      plurals: [
        {
          msgid: '{{count}} item for {{user}}',
          msgid_plural: '{{count}} items for {{user}}',
          msgstr: ['{{count}} item for {{user}}', '{{count}} items for {{user}}'],
        },
      ],
    });
    writePo(path.join(dir, 'pl-PL.po'), {
      language: 'pl',
      pluralForms: 'nplurals=3; plural=(n==1 ? 0 : 2)',
      entries: [{ msgid: 'filler', msgstr: 'wypełniacz' }],
      plurals: [
        {
          msgid: '{{count}} item for {{user}}',
          msgid_plural: '{{count}} items for {{user}}',
          msgstr: [
            '{{count}} element dla {{user}}',     // OK — both vars present
            '{{count}} elementy',                   // MISSING {{user}}
            '{{count}} elementów dla {{extra}}',    // MISSING {{user}}, EXTRA {{extra}}
          ],
        },
      ],
    });
  });

  it('detects missing variables in plural forms', () => {
    const result = validateTranslations(dir);
    const missingVar = result.issues.filter(
      (i) => i.type === 'variable-mismatch' && i.severity === 'error' && i.lang === 'pl'
    );
    assert.ok(missingVar.length >= 2, `should detect at least 2 missing variable errors, got ${missingVar.length}`);
    // form[1] and form[2] should both report missing {{user}}
    const msgs = missingVar.map((i) => i.message);
    assert.ok(
      msgs.some((m) => m.includes('plural form [1]') && m.includes('{{user}}')),
      'should report missing {{user}} in form [1]'
    );
    assert.ok(
      msgs.some((m) => m.includes('plural form [2]') && m.includes('{{user}}')),
      'should report missing {{user}} in form [2]'
    );
  });

  it('detects extra variables in plural forms', () => {
    const result = validateTranslations(dir);
    const extraVar = result.issues.filter(
      (i) => i.type === 'variable-mismatch' && i.severity === 'warning' && i.lang === 'pl'
    );
    assert.ok(extraVar.length >= 1, 'should detect extra variable warning');
    assert.ok(
      extraVar.some((m) => m.message.includes('{{extra}}')),
      'should report extra {{extra}} in form [2]'
    );
  });

  it('no variable issues for form [0] which has both vars', () => {
    const result = validateTranslations(dir);
    const form0Issues = result.issues.filter(
      (i) => i.type === 'variable-mismatch' && i.lang === 'pl' && i.message.includes('form [0]')
    );
    assert.equal(form0Issues.length, 0, 'form [0] has both vars, should have no issues');
  });
});

// ─── Singular variable: extra variables ───────────────────

describe('validateTranslations — extra variable warning', () => {
  const dir = path.join(TMP, 'extra-var');

  before(() => {
    fs.mkdirSync(dir, { recursive: true });
    writePo(path.join(dir, 'en-US.po'), {
      language: 'en',
      entries: [
        { msgid: 'greeting', msgstr: 'Hello {{name}}' },
      ],
    });
    writePo(path.join(dir, 'pl-PL.po'), {
      language: 'pl',
      entries: [
        { msgid: 'greeting', msgstr: 'Cześć {{name}} {{extra}}' },
      ],
    });
  });

  it('detects extra variables as warning', () => {
    const result = validateTranslations(dir);
    const extraVar = result.issues.filter(
      (i) => i.type === 'variable-mismatch' && i.severity === 'warning'
    );
    assert.ok(extraVar.length > 0, 'should detect extra {{extra}} as warning');
    assert.ok(extraVar[0].message.includes('{{extra}}'), 'message should mention {{extra}}');
  });
});

// ─── All-clean scenario ──────────────────────────────────

describe('validateTranslations — no issues', () => {
  const dir = path.join(TMP, 'clean');

  before(() => {
    fs.mkdirSync(dir, { recursive: true });
    writePo(path.join(dir, 'en-US.po'), {
      language: 'en',
      pluralForms: 'nplurals=2; plural=(n != 1)',
      entries: [
        { msgid: 'hello', msgstr: 'Hello' },
      ],
      plurals: [
        { msgid: '%d cat', msgid_plural: '%d cats', msgstr: ['%d cat', '%d cats'] },
      ],
    });
    writePo(path.join(dir, 'pl-PL.po'), {
      language: 'pl',
      pluralForms: 'nplurals=3; plural=(n==1 ? 0 : 2)',
      entries: [
        { msgid: 'hello', msgstr: 'Cześć' },
      ],
      plurals: [
        { msgid: '%d cat', msgid_plural: '%d cats', msgstr: ['%d kot', '%d koty', '%d kotów'] },
      ],
    });
  });

  it('returns zero issues when all translations are complete', () => {
    const result = validateTranslations(dir);
    assert.equal(result.issues.length, 0, 'should have no issues');
  });

  it('returns correct totalPluralKeys for clean data', () => {
    const result = validateTranslations(dir);
    assert.equal(result.totalPluralKeys, 1);
  });
});
// ─── CLI exit code tests ─────────────────────────────────

describe('validate CLI exit codes', () => {
  const { execFileSync } = require('child_process');
  const BIN = path.join(__dirname, '..', 'bin', 'translation-toolkit.js');

  it('exits 0 when no validation errors', () => {
    // Use the clean dir created above
    const cleanDir = path.join(TMP, 'cli-clean');
    fs.mkdirSync(cleanDir, { recursive: true });
    writePo(path.join(cleanDir, 'en-US.po'), {
      language: 'en',
      pluralForms: 'nplurals=2; plural=(n != 1)',
      entries: [{ msgid: 'hello', msgstr: 'Hello' }],
    });
    writePo(path.join(cleanDir, 'pl-PL.po'), {
      language: 'pl',
      pluralForms: 'nplurals=3; plural=(n==1 ? 0 : 2)',
      entries: [{ msgid: 'hello', msgstr: 'Cześć' }],
    });

    // Should NOT throw (exit 0)
    const output = execFileSync(process.execPath, [BIN, 'validate', '--dir', cleanDir], {
      encoding: 'utf-8',
    });
    assert.ok(output.includes('No issues found'), 'Should report no issues');
  });

  it('exits 1 when validation errors exist', () => {
    const errDir = path.join(TMP, 'cli-errors');
    fs.mkdirSync(errDir, { recursive: true });
    writePo(path.join(errDir, 'en-US.po'), {
      language: 'en',
      entries: [
        { msgid: 'hello', msgstr: 'Hello' },
        { msgid: 'world', msgstr: 'World' },
      ],
    });
    writePo(path.join(errDir, 'pl-PL.po'), {
      language: 'pl',
      entries: [
        { msgid: 'hello', msgstr: 'Cześć' },
        // 'world' missing → error
      ],
    });

    try {
      execFileSync(process.execPath, [BIN, 'validate', '--dir', errDir], {
        encoding: 'utf-8',
      });
      assert.fail('Should have exited with code 1');
    } catch (err) {
      assert.equal(err.status, 1, 'Exit code should be 1 when errors exist');
      assert.ok(err.stdout.includes('missing key'),
        'Output should mention missing key');
    }
  });
});

// ─── Fuzzy detection ────────────────────────────────────

describe('validateTranslations — fuzzy detection', () => {
  it('detects fuzzy entries from fixtures', () => {
    const result = validateTranslations(FIXTURES);
    const fuzzyIssues = result.issues.filter((i) => i.type === 'fuzzy-entry');
    assert.ok(fuzzyIssues.length > 0, 'should detect fuzzy entries in fixtures');
    const fuzzyKeys = fuzzyIssues.map((i) => i.key);
    assert.ok(fuzzyKeys.includes('commented.entry'), 'commented.entry is fuzzy');
    assert.ok(fuzzyKeys.includes('fuzzy.entry'), 'fuzzy.entry is fuzzy');
    assert.ok(fuzzyKeys.includes('new.key.name'), 'new.key.name is fuzzy');
  });

  it('returns totalFuzzyKeys count from fixtures', () => {
    const result = validateTranslations(FIXTURES);
    assert.ok(result.totalFuzzyKeys >= 3, `should have >= 3 fuzzy keys, got ${result.totalFuzzyKeys}`);
  });

  it('fuzzy issues have severity warning', () => {
    const result = validateTranslations(FIXTURES);
    const fuzzyIssues = result.issues.filter((i) => i.type === 'fuzzy-entry');
    for (const issue of fuzzyIssues) {
      assert.equal(issue.severity, 'warning', 'fuzzy issues should be warnings');
    }
  });

  it('detects fuzzy in custom .po files', () => {
    const dir = path.join(TMP, 'fuzzy-custom');
    fs.mkdirSync(dir, { recursive: true });
    writePo(path.join(dir, 'en-US.po'), {
      language: 'en',
      entries: [
        { msgid: 'hello', msgstr: 'Hello' },
        { msgid: 'world', msgstr: 'World', flags: 'fuzzy' },
      ],
    });
    writePo(path.join(dir, 'pl-PL.po'), {
      language: 'pl',
      entries: [
        { msgid: 'hello', msgstr: 'Cześć' },
        { msgid: 'world', msgstr: 'Świat', flags: 'fuzzy, c-format' },
      ],
    });
    const result = validateTranslations(dir);
    const fuzzyIssues = result.issues.filter((i) => i.type === 'fuzzy-entry');
    assert.ok(fuzzyIssues.length >= 2, 'should detect fuzzy in both languages');
    assert.equal(result.totalFuzzyKeys, 2, 'one fuzzy key in each of 2 languages = 2 total');
  });

  it('returns zero fuzzyKeys when no fuzzy entries', () => {
    const dir = path.join(TMP, 'no-fuzzy');
    fs.mkdirSync(dir, { recursive: true });
    writePo(path.join(dir, 'en-US.po'), {
      language: 'en',
      entries: [
        { msgid: 'hello', msgstr: 'Hello' },
      ],
    });
    const result = validateTranslations(dir);
    const fuzzyIssues = result.issues.filter((i) => i.type === 'fuzzy-entry');
    assert.equal(fuzzyIssues.length, 0, 'no fuzzy issues');
    assert.equal(result.totalFuzzyKeys, 0, 'zero fuzzy keys');
  });
});