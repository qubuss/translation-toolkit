/**
 * Tests for stats.js — computeStats() core function.
 *
 * Covers singular and plural statistics:
 * - refLang, refKeyCount, languages, coverage
 * - pluralKeys, pluralForms, emptyPluralForms per language
 * - topMissing, extraKeys, overallCoverage
 *
 * Run: node --test test/stats.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { computeStats } = require('../lib/stats');

const FIXTURES = path.join(__dirname, 'fixtures');
const TMP = path.join(__dirname, '.tmp-stats');

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
 * @param {Array<{msgid: string, msgstr: string}>} [opts.entries]
 * @param {Array<{msgid: string, msgid_plural: string, msgstr: string[]}>} [opts.plurals]
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
    lines.push(`msgid "${e.msgid}"`);
    lines.push(`msgstr "${e.msgstr}"`);
    lines.push('');
  }

  for (const p of (opts.plurals || [])) {
    lines.push(`msgid "${p.msgid}"`);
    lines.push(`msgid_plural "${p.msgid_plural}"`);
    for (let i = 0; i < p.msgstr.length; i++) {
      lines.push(`msgstr[${i}] "${p.msgstr[i]}"`);
    }
    lines.push('');
  }

  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
}

// ─── Fixtures stats ──────────────────────────────────────

describe('computeStats — fixtures', () => {
  it('returns correct refLang and languages', () => {
    const result = computeStats(FIXTURES);
    assert.equal(result.refLang, 'en', 'en should be reference (most keys)');
    assert.ok(result.languages.includes('en'), 'should include en');
    assert.ok(result.languages.includes('pl'), 'should include pl');
  });

  it('returns correct refKeyCount for singular entries', () => {
    const result = computeStats(FIXTURES);
    assert.ok(result.refKeyCount >= 50, `should have >= 50 ref keys, got ${result.refKeyCount}`);
  });

  it('returns plural stats for English (2 forms per entry)', () => {
    const result = computeStats(FIXTURES);
    const enStats = result.langStats.find((s) => s.lang === 'en');
    assert.ok(enStats, 'en stats should exist');
    assert.equal(enStats.pluralKeys, 4, 'en has 4 plural entries');
    assert.equal(enStats.pluralForms, 8, 'en has 4 entries × 2 forms = 8 forms');
    // All forms are filled (multi-line msgstr is not empty)
    assert.equal(enStats.emptyPluralForms, 0, 'en has 0 empty plural forms');
  });

  it('returns plural stats for Polish (3 forms per entry)', () => {
    const result = computeStats(FIXTURES);
    const plStats = result.langStats.find((s) => s.lang === 'pl');
    assert.ok(plStats, 'pl stats should exist');
    assert.equal(plStats.pluralKeys, 4, 'pl has 4 plural entries');
    assert.equal(plStats.pluralForms, 12, 'pl has 4 entries × 3 forms = 12 forms');
    // All forms are filled (multi-line msgstr is not empty)
    assert.equal(plStats.emptyPluralForms, 0, 'pl has 0 empty plural forms');
  });

  it('reference language is sorted first in langStats', () => {
    const result = computeStats(FIXTURES);
    assert.equal(result.langStats[0].lang, 'en', 'reference lang should be first');
  });
});

// ─── Empty directory ──────────────────────────────────────

describe('computeStats — empty directory', () => {
  it('returns empty result for directory with no .po files', () => {
    const emptyDir = path.join(TMP, 'empty');
    fs.mkdirSync(emptyDir, { recursive: true });
    const result = computeStats(emptyDir);
    assert.equal(result.refLang, '');
    assert.equal(result.refKeyCount, 0);
    assert.deepEqual(result.languages, []);
    assert.deepEqual(result.langStats, []);
    assert.equal(result.overallCoverage, 0);
  });
});

// ─── Basic singular stats ─────────────────────────────────

describe('computeStats — singular stats', () => {
  const dir = path.join(TMP, 'singular');

  before(() => {
    fs.mkdirSync(dir, { recursive: true });
    writePo(path.join(dir, 'en-US.po'), {
      language: 'en',
      entries: [
        { msgid: 'a', msgstr: 'A' },
        { msgid: 'b', msgstr: 'B' },
        { msgid: 'c', msgstr: 'C' },
        { msgid: 'd', msgstr: 'D' },
      ],
    });
    writePo(path.join(dir, 'pl-PL.po'), {
      language: 'pl',
      entries: [
        { msgid: 'a', msgstr: 'Aa' },
        { msgid: 'b', msgstr: '' }, // empty
        // c missing
        { msgid: 'extra', msgstr: 'Ekstra' }, // extra key
      ],
    });
  });

  it('calculates translated, empty, missing, extra keys', () => {
    const result = computeStats(dir);
    const plStats = result.langStats.find((s) => s.lang === 'pl');
    assert.ok(plStats, 'pl stats should exist');
    assert.equal(plStats.translatedKeys, 2, 'pl has 2 translated (a + extra)');
    assert.equal(plStats.emptyKeys, 1, 'pl has 1 empty (b)');
    assert.equal(plStats.missingKeys, 2, 'pl is missing c and d');
    assert.equal(plStats.extraKeys, 1, 'pl has 1 extra key');
  });

  it('calculates correct coverage', () => {
    const result = computeStats(dir);
    const plStats = result.langStats.find((s) => s.lang === 'pl');
    // Coverage = translated keys from ref / refKeyCount
    // "a" is translated, "b" is empty, "c" and "d" are missing → 1 / 4 = 25%
    assert.equal(plStats.coverage, 25, 'pl should have 25% coverage');
  });

  it('refLang coverage is based on its own keys', () => {
    const result = computeStats(dir);
    const enStats = result.langStats.find((s) => s.lang === 'en');
    assert.equal(enStats.coverage, 100, 'en should have 100% coverage');
  });

  it('topMissing lists missing keys', () => {
    const result = computeStats(dir);
    const plStats = result.langStats.find((s) => s.lang === 'pl');
    assert.ok(plStats.topMissing.includes('c'), 'topMissing should include c');
    assert.ok(plStats.topMissing.includes('d'), 'topMissing should include d');
  });

  it('overallCoverage averages non-ref languages', () => {
    const result = computeStats(dir);
    assert.equal(result.overallCoverage, 25, 'overall should be 25% (only pl)');
  });
});

// ─── Plural stats ─────────────────────────────────────────

describe('computeStats — plural stats', () => {
  const dir = path.join(TMP, 'plural');

  before(() => {
    fs.mkdirSync(dir, { recursive: true });
    writePo(path.join(dir, 'en-US.po'), {
      language: 'en',
      pluralForms: 'nplurals=2; plural=(n != 1)',
      entries: [{ msgid: 'filler', msgstr: 'filler' }],
      plurals: [
        { msgid: '%d cat', msgid_plural: '%d cats', msgstr: ['%d cat', '%d cats'] },
        { msgid: '%d dog', msgid_plural: '%d dogs', msgstr: ['%d dog', ''] }, // 1 empty form
      ],
    });
    writePo(path.join(dir, 'pl-PL.po'), {
      language: 'pl',
      pluralForms: 'nplurals=3; plural=(n==1 ? 0 : 2)',
      entries: [{ msgid: 'filler', msgstr: 'wypełniacz' }],
      plurals: [
        { msgid: '%d cat', msgid_plural: '%d cats', msgstr: ['%d kot', '%d koty', ''] }, // 1 empty
        { msgid: '%d dog', msgid_plural: '%d dogs', msgstr: ['', '', ''] },              // 3 empty
      ],
    });
  });

  it('counts pluralKeys per language', () => {
    const result = computeStats(dir);
    const en = result.langStats.find((s) => s.lang === 'en');
    const pl = result.langStats.find((s) => s.lang === 'pl');
    assert.equal(en.pluralKeys, 2, 'en has 2 plural entries');
    assert.equal(pl.pluralKeys, 2, 'pl has 2 plural entries');
  });

  it('counts pluralForms per language', () => {
    const result = computeStats(dir);
    const en = result.langStats.find((s) => s.lang === 'en');
    const pl = result.langStats.find((s) => s.lang === 'pl');
    assert.equal(en.pluralForms, 4, 'en has 2 entries × 2 forms = 4');
    assert.equal(pl.pluralForms, 6, 'pl has 2 entries × 3 forms = 6');
  });

  it('counts emptyPluralForms per language', () => {
    const result = computeStats(dir);
    const en = result.langStats.find((s) => s.lang === 'en');
    const pl = result.langStats.find((s) => s.lang === 'pl');
    assert.equal(en.emptyPluralForms, 1, 'en has 1 empty plural form');
    assert.equal(pl.emptyPluralForms, 4, 'pl has 4 empty plural forms');
  });

  it('zero plural stats when no plural entries', () => {
    const noPlDir = path.join(TMP, 'no-plural');
    fs.mkdirSync(noPlDir, { recursive: true });
    writePo(path.join(noPlDir, 'en-US.po'), {
      language: 'en',
      entries: [{ msgid: 'a', msgstr: 'A' }],
    });
    const result = computeStats(noPlDir);
    const en = result.langStats.find((s) => s.lang === 'en');
    assert.equal(en.pluralKeys, 0);
    assert.equal(en.pluralForms, 0);
    assert.equal(en.emptyPluralForms, 0);
  });
});

// ─── topMissingCount parameter ───────────────────────────

describe('computeStats — topMissingCount', () => {
  const dir = path.join(TMP, 'top-missing');

  before(() => {
    fs.mkdirSync(dir, { recursive: true });
    const entries = [];
    for (let i = 0; i < 20; i++) {
      entries.push({ msgid: `key${i}`, msgstr: `val${i}` });
    }
    writePo(path.join(dir, 'en-US.po'), { language: 'en', entries });
    // pl has no entries → all 20 missing
    writePo(path.join(dir, 'pl-PL.po'), {
      language: 'pl',
      entries: [{ msgid: 'extra', msgstr: 'extra' }],
    });
  });

  it('limits topMissing to specified count', () => {
    const result = computeStats(dir, 5);
    const pl = result.langStats.find((s) => s.lang === 'pl');
    assert.equal(pl.topMissing.length, 5, 'topMissing should be limited to 5');
    assert.equal(pl.missingKeys, 20, 'but total missingKeys should be 20');
  });

  it('default topMissingCount is 10', () => {
    const result = computeStats(dir);
    const pl = result.langStats.find((s) => s.lang === 'pl');
    assert.equal(pl.topMissing.length, 10, 'default topMissing limit is 10');
  });
});
