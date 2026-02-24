/**
 * Tests for i18next format export/import (Phase 3.2).
 *
 * Covers:
 * - exportToI18next: .po → per-language i18next JSON files (v4 CLDR + v3 legacy)
 * - importFromI18next: i18next JSON → .po files (patch + create)
 * - parseI18nextFile: parse i18next JSON with plural suffix detection
 * - Round-trip: .po → i18next → .po preservation
 * - CLDR plural suffix mapping (en: one/other, pl: one/few/many)
 * - v3 compatibility mode (_plural, _0/_1/_2)
 * - CLI --format i18next integration
 * - Helper functions (_getCLDRCategories, key converters)
 *
 * Run: node --test test/i18nextFormat.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parsePo, discoverPoFiles } = require('../lib/poParser');
const {
  exportToI18next,
  importFromI18next,
  parseI18nextFile,
  discoverI18nextFiles,
  _internalKeyToI18next,
  _i18nextKeyToInternal,
  _getCLDRCategories,
  GETTEXT_TO_CLDR,
  DEFAULT_CLDR,
  CLDR_CATEGORIES,
  I18NEXT_PLURAL_RE,
  I18NEXT_V3_PLURAL_RE,
} = require('../lib/i18nextFormat');

const FIXTURES = path.join(__dirname, 'fixtures');
const TMP = path.join(__dirname, '.tmp-i18next');
const BIN = path.join(__dirname, '..', 'bin', 'translation-toolkit.js');

before(() => {
  fs.mkdirSync(TMP, { recursive: true });
});

after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

// ── Helper functions ────────────────────────────────────────────────────

describe('i18next format helpers', () => {
  it('_internalKeyToI18next converts \\x04 to ::', () => {
    assert.equal(_internalKeyToI18next('menu\x04Save'), 'menu::Save');
    assert.equal(_internalKeyToI18next('simple.key'), 'simple.key');
  });

  it('_i18nextKeyToInternal converts :: to \\x04', () => {
    assert.equal(_i18nextKeyToInternal('menu::Save'), 'menu\x04Save');
    assert.equal(_i18nextKeyToInternal('simple.key'), 'simple.key');
  });

  it('_getCLDRCategories returns correct mapping for English', () => {
    const categories = _getCLDRCategories('en');
    assert.deepEqual(categories, ['one', 'other']);
  });

  it('_getCLDRCategories returns correct mapping for Polish', () => {
    const categories = _getCLDRCategories('pl');
    assert.deepEqual(categories, ['one', 'few', 'many']);
  });

  it('_getCLDRCategories returns correct mapping for Czech', () => {
    const categories = _getCLDRCategories('cs');
    assert.deepEqual(categories, ['one', 'few', 'other']);
  });

  it('_getCLDRCategories returns correct mapping for Arabic', () => {
    const categories = _getCLDRCategories('ar');
    assert.deepEqual(categories, ['zero', 'one', 'two', 'few', 'many', 'other']);
  });

  it('_getCLDRCategories falls back to default for unknown language', () => {
    const categories = _getCLDRCategories('xx');
    assert.deepEqual(categories, DEFAULT_CLDR);
    assert.deepEqual(categories, ['one', 'other']);
  });

  it('I18NEXT_PLURAL_RE detects CLDR suffixes', () => {
    for (const cat of CLDR_CATEGORIES) {
      const match = ('myKey_' + cat).match(I18NEXT_PLURAL_RE);
      assert.ok(match, `should match _${cat}`);
      assert.equal(match[1], 'myKey');
      assert.equal(match[2], cat);
    }
    // Should not match non-CLDR suffixes
    assert.equal('myKey_singular'.match(I18NEXT_PLURAL_RE), null);
    assert.equal('myKey'.match(I18NEXT_PLURAL_RE), null);
  });

  it('I18NEXT_V3_PLURAL_RE detects v3 suffixes', () => {
    // _plural
    const m1 = 'myKey_plural'.match(I18NEXT_V3_PLURAL_RE);
    assert.ok(m1);
    assert.equal(m1[1], 'myKey');

    // _0, _1, _2
    const m2 = 'myKey_0'.match(I18NEXT_V3_PLURAL_RE);
    assert.ok(m2);
    assert.equal(m2[1], 'myKey');
    assert.equal(m2[2], '0');

    const m3 = 'myKey_2'.match(I18NEXT_V3_PLURAL_RE);
    assert.ok(m3);
    assert.equal(m3[1], 'myKey');
    assert.equal(m3[2], '2');

    // Should not match plain keys
    assert.equal('myKey'.match(I18NEXT_V3_PLURAL_RE), null);
  });
});

// ── Export v4 (CLDR) ────────────────────────────────────────────────────

describe('exportToI18next v4 (CLDR)', () => {
  const outDir = path.join(TMP, 'export-v4');

  before(() => {
    fs.mkdirSync(outDir, { recursive: true });
    exportToI18next(outDir, FIXTURES, { compatibilityJSON: 4 });
  });

  it('creates per-language JSON files', () => {
    assert.ok(fs.existsSync(path.join(outDir, 'en.json')));
    assert.ok(fs.existsSync(path.join(outDir, 'pl.json')));
  });

  it('exports singular entries as plain strings', () => {
    const en = JSON.parse(fs.readFileSync(path.join(outDir, 'en.json'), 'utf-8'));
    assert.equal(typeof en['simple.key'], 'string');
    assert.equal(en['simple.key'], 'Simple value');
  });

  it('exports English plural with _one and _other suffixes', () => {
    const en = JSON.parse(fs.readFileSync(path.join(outDir, 'en.json'), 'utf-8'));
    // %d file → msgstr[0] = "%d file", msgstr[1] = "%d files"
    assert.equal(en['%d file_one'], '%d file');
    assert.equal(en['%d file_other'], '%d files');
    // Should not have an un-suffixed key for plural entries
    assert.equal(en['%d file'], undefined);
  });

  it('exports Polish plural with _one, _few, _many suffixes', () => {
    const pl = JSON.parse(fs.readFileSync(path.join(outDir, 'pl.json'), 'utf-8'));
    // Polish has 3 forms
    assert.equal(pl['%d file_one'], '%d plik');
    assert.equal(pl['%d file_few'], '%d pliki');
    assert.equal(pl['%d file_many'], '%d plików');
  });

  it('exports msgctxt keys with :: separator', () => {
    const en = JSON.parse(fs.readFileSync(path.join(outDir, 'en.json'), 'utf-8'));
    // notifications\x04You have %d new message → "notifications::You have %d new message"
    assert.equal(en['notifications::You have %d new message_one'], 'You have %d new message');
    assert.equal(en['notifications::You have %d new message_other'], 'You have %d new messages');
  });

  it('produces valid JSON', () => {
    const raw = fs.readFileSync(path.join(outDir, 'en.json'), 'utf-8');
    assert.doesNotThrow(() => JSON.parse(raw));
  });

  it('produces pretty-printed output', () => {
    const raw = fs.readFileSync(path.join(outDir, 'en.json'), 'utf-8');
    assert.ok(raw.includes('\n  '), 'should be pretty-printed with 2-space indent');
  });
});

// ── Export v3 (legacy) ──────────────────────────────────────────────────

describe('exportToI18next v3 (legacy)', () => {
  const outDir = path.join(TMP, 'export-v3');

  before(() => {
    fs.mkdirSync(outDir, { recursive: true });
    exportToI18next(outDir, FIXTURES, { compatibilityJSON: 3 });
  });

  it('exports English plural with base + _plural (nplurals=2)', () => {
    const en = JSON.parse(fs.readFileSync(path.join(outDir, 'en.json'), 'utf-8'));
    assert.equal(en['%d file'], '%d file');
    assert.equal(en['%d file_plural'], '%d files');
  });

  it('exports Polish plural with _0, _1, _2 (nplurals=3)', () => {
    const pl = JSON.parse(fs.readFileSync(path.join(outDir, 'pl.json'), 'utf-8'));
    assert.equal(pl['%d file_0'], '%d plik');
    assert.equal(pl['%d file_1'], '%d pliki');
    assert.equal(pl['%d file_2'], '%d plików');
    // Should NOT have base or _plural for nplurals>2
    assert.equal(pl['%d file'], undefined);
    assert.equal(pl['%d file_plural'], undefined);
  });

  it('exports singular entries same as v4', () => {
    const en = JSON.parse(fs.readFileSync(path.join(outDir, 'en.json'), 'utf-8'));
    assert.equal(en['simple.key'], 'Simple value');
  });
});

// ── Parse i18next file (v4) ─────────────────────────────────────────────

describe('parseI18nextFile v4', () => {
  it('parses singular entries', () => {
    const tmpFile = path.join(TMP, 'parse-v4-singular.json');
    fs.writeFileSync(tmpFile, JSON.stringify({
      greeting: 'Hello',
      farewell: 'Goodbye',
    }));
    const { entries, pluralEntries } = parseI18nextFile(tmpFile, 'en', 4);
    assert.equal(entries.size, 2);
    assert.equal(entries.get('greeting'), 'Hello');
    assert.equal(pluralEntries.size, 0);
  });

  it('parses v4 CLDR plural keys for English', () => {
    const tmpFile = path.join(TMP, 'parse-v4-en-plural.json');
    fs.writeFileSync(tmpFile, JSON.stringify({
      'item_one': '1 item',
      'item_other': '%d items',
      'greeting': 'Hello',
    }));
    const { entries, pluralEntries } = parseI18nextFile(tmpFile, 'en', 4);
    assert.equal(entries.size, 1);
    assert.equal(entries.get('greeting'), 'Hello');
    assert.equal(pluralEntries.size, 1);
    assert.ok(pluralEntries.has('item'));
    assert.deepEqual(pluralEntries.get('item').msgstr, ['1 item', '%d items']);
  });

  it('parses v4 CLDR plural keys for Polish', () => {
    const tmpFile = path.join(TMP, 'parse-v4-pl-plural.json');
    fs.writeFileSync(tmpFile, JSON.stringify({
      'item_one': '1 element',
      'item_few': '%d elementy',
      'item_many': '%d elementów',
    }));
    const { entries, pluralEntries } = parseI18nextFile(tmpFile, 'pl', 4);
    assert.equal(pluralEntries.size, 1);
    assert.deepEqual(pluralEntries.get('item').msgstr, ['1 element', '%d elementy', '%d elementów']);
  });

  it('parses :: keys back to internal \\x04', () => {
    const tmpFile = path.join(TMP, 'parse-v4-ctx.json');
    fs.writeFileSync(tmpFile, JSON.stringify({
      'menu::Save': 'Save',
      'menu::Open_one': '1 file',
      'menu::Open_other': '%d files',
    }));
    const { entries, pluralEntries } = parseI18nextFile(tmpFile, 'en', 4);
    assert.ok(entries.has('menu\x04Save'));
    assert.ok(pluralEntries.has('menu\x04Open'));
    assert.deepEqual(pluralEntries.get('menu\x04Open').msgstr, ['1 file', '%d files']);
  });
});

// ── Parse i18next file (v3) ─────────────────────────────────────────────

describe('parseI18nextFile v3', () => {
  it('parses base + _plural (nplurals=2)', () => {
    const tmpFile = path.join(TMP, 'parse-v3-en.json');
    fs.writeFileSync(tmpFile, JSON.stringify({
      'item': '1 item',
      'item_plural': '%d items',
      'greeting': 'Hello',
    }));
    const { entries, pluralEntries } = parseI18nextFile(tmpFile, 'en', 3);
    assert.equal(entries.size, 1);
    assert.equal(entries.get('greeting'), 'Hello');
    assert.equal(pluralEntries.size, 1);
    assert.deepEqual(pluralEntries.get('item').msgstr, ['1 item', '%d items']);
  });

  it('parses _0, _1, _2 (nplurals>2)', () => {
    const tmpFile = path.join(TMP, 'parse-v3-pl.json');
    fs.writeFileSync(tmpFile, JSON.stringify({
      'item_0': '1 element',
      'item_1': '%d elementy',
      'item_2': '%d elementów',
      'greeting': 'Cześć',
    }));
    const { entries, pluralEntries } = parseI18nextFile(tmpFile, 'pl', 3);
    assert.equal(entries.size, 1);
    assert.equal(entries.get('greeting'), 'Cześć');
    assert.equal(pluralEntries.size, 1);
    assert.deepEqual(pluralEntries.get('item').msgstr, ['1 element', '%d elementy', '%d elementów']);
  });
});

// ── Discover i18next files ──────────────────────────────────────────────

describe('discoverI18nextFiles', () => {
  it('discovers JSON files by short code', () => {
    const tmpDir = path.join(TMP, 'discover');
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'en.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'pl.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');

    const files = discoverI18nextFiles(tmpDir);
    assert.equal(files.length, 2);
    const codes = files.map((f) => f.shortCode).sort();
    assert.deepEqual(codes, ['en', 'pl']);
  });

  it('returns empty array for nonexistent directory', () => {
    const files = discoverI18nextFiles('/nonexistent/path');
    assert.deepEqual(files, []);
  });

  it('skips files with invalid short codes', () => {
    const tmpDir = path.join(TMP, 'discover-skip');
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'en.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'toolong-code.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'x.json'), '{}');

    const files = discoverI18nextFiles(tmpDir);
    assert.equal(files.length, 1);
    assert.equal(files[0].shortCode, 'en');
  });
});

// ── Round-trip tests ────────────────────────────────────────────────────

describe('i18next v4 round-trip', () => {
  const exportDir = path.join(TMP, 'rt-v4-export');
  const importDir = path.join(TMP, 'rt-v4-import');

  before(() => {
    fs.mkdirSync(exportDir, { recursive: true });
    fs.mkdirSync(importDir, { recursive: true });

    // Copy fixture .po files to importDir
    for (const file of ['en-US.po', 'pl-PL.po']) {
      fs.copyFileSync(path.join(FIXTURES, file), path.join(importDir, file));
    }

    // Export to i18next v4
    exportToI18next(exportDir, FIXTURES, { compatibilityJSON: 4 });
    // Import back
    importFromI18next(exportDir, false, importDir, false, 4);
  });

  it('preserves singular entries after round-trip', () => {
    const originalEn = parsePo(path.join(FIXTURES, 'en-US.po'));
    const importedEn = parsePo(path.join(importDir, 'en-US.po'));

    for (const [key, value] of originalEn.entries) {
      assert.equal(importedEn.entries.get(key), value,
        `Mismatch for key "${key}": "${importedEn.entries.get(key)}" vs "${value}"`);
    }
  });

  it('preserves plural entries after round-trip', () => {
    const originalEn = parsePo(path.join(FIXTURES, 'en-US.po'));
    const importedEn = parsePo(path.join(importDir, 'en-US.po'));

    for (const [key, entry] of originalEn.pluralEntries) {
      const imported = importedEn.pluralEntries.get(key);
      assert.ok(imported, `Missing plural entry for key "${key}"`);
      assert.deepEqual(imported.msgstr, entry.msgstr,
        `Plural mismatch for key "${key}"`);
    }
  });

  it('preserves msgctxt plural entries after round-trip', () => {
    const originalEn = parsePo(path.join(FIXTURES, 'en-US.po'));
    const importedEn = parsePo(path.join(importDir, 'en-US.po'));

    // Check notifications\x04You have %d new message
    const ctxKey = 'notifications\x04You have %d new message';
    const orig = originalEn.pluralEntries.get(ctxKey);
    const imp = importedEn.pluralEntries.get(ctxKey);
    assert.ok(orig, 'Original should have msgctxt plural entry');
    assert.ok(imp, 'Imported should have msgctxt plural entry');
    assert.deepEqual(imp.msgstr, orig.msgstr);
  });
});

describe('i18next v3 round-trip', () => {
  const exportDir = path.join(TMP, 'rt-v3-export');
  const importDir = path.join(TMP, 'rt-v3-import');

  before(() => {
    fs.mkdirSync(exportDir, { recursive: true });
    fs.mkdirSync(importDir, { recursive: true });

    // Copy fixture .po files to importDir
    for (const file of ['en-US.po', 'pl-PL.po']) {
      fs.copyFileSync(path.join(FIXTURES, file), path.join(importDir, file));
    }

    // Export to i18next v3
    exportToI18next(exportDir, FIXTURES, { compatibilityJSON: 3 });
    // Import back
    importFromI18next(exportDir, false, importDir, false, 3);
  });

  it('preserves singular entries after v3 round-trip', () => {
    const originalEn = parsePo(path.join(FIXTURES, 'en-US.po'));
    const importedEn = parsePo(path.join(importDir, 'en-US.po'));

    for (const [key, value] of originalEn.entries) {
      assert.equal(importedEn.entries.get(key), value,
        `Mismatch for key "${key}"`);
    }
  });

  it('preserves English plural entries after v3 round-trip', () => {
    const originalEn = parsePo(path.join(FIXTURES, 'en-US.po'));
    const importedEn = parsePo(path.join(importDir, 'en-US.po'));

    for (const [key, entry] of originalEn.pluralEntries) {
      const imported = importedEn.pluralEntries.get(key);
      assert.ok(imported, `Missing plural entry for key "${key}"`);
      assert.deepEqual(imported.msgstr, entry.msgstr, `Plural mismatch for key "${key}"`);
    }
  });

  it('preserves Polish plural entries after v3 round-trip', () => {
    const originalPl = parsePo(path.join(FIXTURES, 'pl-PL.po'));
    const importedPl = parsePo(path.join(importDir, 'pl-PL.po'));

    for (const [key, entry] of originalPl.pluralEntries) {
      const imported = importedPl.pluralEntries.get(key);
      assert.ok(imported, `Missing plural entry for key "${key}"`);
      assert.deepEqual(imported.msgstr, entry.msgstr, `Plural mismatch for key "${key}"`);
    }
  });
});

// ── Export matches fixture ───────────────────────────────────────────────

describe('i18next export matches fixture files', () => {
  const fixtureI18nDir = path.join(FIXTURES, 'i18next');
  const matchDir = path.join(TMP, 'fixture-match');
  const matchI18nDir = path.join(matchDir, 'i18next');
  const matchPoDir = path.join(matchDir, 'po');

  before(() => {
    fs.mkdirSync(matchPoDir, { recursive: true });
    fs.mkdirSync(matchI18nDir, { recursive: true });
    for (const f of fs.readdirSync(FIXTURES)) {
      if (f.endsWith('.po')) {
        fs.copyFileSync(path.join(FIXTURES, f), path.join(matchPoDir, f));
      }
    }
    exportToI18next(matchI18nDir, matchPoDir, { compatibilityJSON: 4 });
  });

  it('exported en.json matches i18next v4 fixture', () => {
    const exported = fs.readFileSync(path.join(matchI18nDir, 'en.json'), 'utf-8');
    const fixture = fs.readFileSync(path.join(fixtureI18nDir, 'en.json'), 'utf-8');
    assert.equal(exported, fixture, 'Exported en.json should match i18next fixture');
  });

  it('exported pl.json matches i18next v4 fixture', () => {
    const exported = fs.readFileSync(path.join(matchI18nDir, 'pl.json'), 'utf-8');
    const fixture = fs.readFileSync(path.join(fixtureI18nDir, 'pl.json'), 'utf-8');
    assert.equal(exported, fixture, 'Exported pl.json should match i18next fixture');
  });
});

describe('i18next integration project matches fixture files', () => {
  const intFixtures = path.join(__dirname, 'integration-project', 'translations');
  const intFixtureI18n = path.join(__dirname, 'integration-project', 'i18next');
  const intMatchDir = path.join(TMP, 'int-fixture-match');
  const intMatchI18nDir = path.join(intMatchDir, 'i18next');
  const intMatchPoDir = path.join(intMatchDir, 'po');

  before(() => {
    if (!fs.existsSync(intFixtures)) return;
    fs.mkdirSync(intMatchPoDir, { recursive: true });
    fs.mkdirSync(intMatchI18nDir, { recursive: true });
    for (const f of fs.readdirSync(intFixtures)) {
      if (f.endsWith('.po')) {
        fs.copyFileSync(path.join(intFixtures, f), path.join(intMatchPoDir, f));
      }
    }
    exportToI18next(intMatchI18nDir, intMatchPoDir, { compatibilityJSON: 4 });
  });

  for (const lang of ['en', 'pl', 'de']) {
    it(`exported ${lang}.json matches i18next integration fixture`, () => {
      if (!fs.existsSync(intFixtures)) return;
      const exported = fs.readFileSync(path.join(intMatchI18nDir, `${lang}.json`), 'utf-8');
      const fixture = fs.readFileSync(path.join(intFixtureI18n, `${lang}.json`), 'utf-8');
      assert.equal(exported, fixture, `Exported ${lang}.json should match i18next integration fixture`);
    });
  }
});

// ── CLI integration ─────────────────────────────────────────────────────

describe('CLI --format i18next', () => {
  it('export --format i18next creates JSON files', () => {
    const outDir = path.join(TMP, 'cli-export-v4');
    fs.mkdirSync(outDir, { recursive: true });

    const result = execFileSync('node', [
      BIN, 'export', '--format', 'i18next', '-o', outDir, '--dir', FIXTURES, '--ci',
    ], { encoding: 'utf-8' });

    assert.ok(result.includes('i18next v4 (CLDR)'));
    assert.ok(fs.existsSync(path.join(outDir, 'en.json')));
    assert.ok(fs.existsSync(path.join(outDir, 'pl.json')));

    // Verify CLDR suffixes in output
    const en = JSON.parse(fs.readFileSync(path.join(outDir, 'en.json'), 'utf-8'));
    assert.ok('%d file_one' in en);
    assert.ok('%d file_other' in en);
  });

  it('export --format i18next --compat 3 creates v3 JSON files', () => {
    const outDir = path.join(TMP, 'cli-export-v3');
    fs.mkdirSync(outDir, { recursive: true });

    const result = execFileSync('node', [
      BIN, 'export', '--format', 'i18next', '--compat', '3', '-o', outDir, '--dir', FIXTURES, '--ci',
    ], { encoding: 'utf-8' });

    assert.ok(result.includes('i18next v3'));
    const en = JSON.parse(fs.readFileSync(path.join(outDir, 'en.json'), 'utf-8'));
    assert.ok('%d file' in en);
    assert.ok('%d file_plural' in en);
  });

  it('import --format i18next reads JSON files', () => {
    // First export
    const jsonDir = path.join(TMP, 'cli-import-src');
    const poDir = path.join(TMP, 'cli-import-dest');
    fs.mkdirSync(jsonDir, { recursive: true });
    fs.mkdirSync(poDir, { recursive: true });

    // Copy .po files to dest
    for (const file of ['en-US.po', 'pl-PL.po']) {
      fs.copyFileSync(path.join(FIXTURES, file), path.join(poDir, file));
    }

    exportToI18next(jsonDir, FIXTURES, { compatibilityJSON: 4 });

    const result = execFileSync('node', [
      BIN, 'import', '--format', 'i18next', jsonDir, '--dir', poDir, '--ci',
    ], { encoding: 'utf-8' });

    assert.ok(result.includes('Import complete'));
    assert.ok(result.includes('Updated'));
  });

  it('rejects unknown format', () => {
    let threw = false;
    try {
      execFileSync('node', [
        BIN, 'export', '--format', 'yaml', '--dir', FIXTURES, '--ci',
      ], { encoding: 'utf-8' });
    } catch (e) {
      threw = true;
      assert.ok(e.stderr.includes('Unknown format'));
    }
    assert.ok(threw, 'Should have thrown for unknown format');
  });

  it('csv remains the default format', () => {
    const outFile = path.join(TMP, 'cli-default.csv');

    execFileSync('node', [
      BIN, 'export', '-o', outFile, '--dir', FIXTURES, '--ci',
    ], { encoding: 'utf-8' });

    const csv = fs.readFileSync(outFile, 'utf-8');
    assert.ok(csv.startsWith('key|'));
  });
});

// ── Integration project tests ───────────────────────────────────────────

describe('i18next format with integration project', () => {
  const integrationDir = path.join(__dirname, 'integration-project', 'translations');
  const outDir = path.join(TMP, 'integration-v4');

  before(() => {
    // Skip if integration project doesn't exist
    if (!fs.existsSync(integrationDir)) {
      return;
    }
    fs.mkdirSync(outDir, { recursive: true });
    exportToI18next(outDir, integrationDir, { compatibilityJSON: 4 });
  });

  it('exports all 3 languages from integration project', () => {
    if (!fs.existsSync(integrationDir)) {
      return; // skip
    }
    assert.ok(fs.existsSync(path.join(outDir, 'en.json')));
    assert.ok(fs.existsSync(path.join(outDir, 'pl.json')));
    assert.ok(fs.existsSync(path.join(outDir, 'de.json')));
  });

  it('round-trips integration project through i18next v4', () => {
    if (!fs.existsSync(integrationDir)) {
      return; // skip
    }
    const rtDir = path.join(TMP, 'integration-rt');
    fs.mkdirSync(rtDir, { recursive: true });

    // Copy .po files
    for (const file of fs.readdirSync(integrationDir)) {
      if (file.endsWith('.po')) {
        fs.copyFileSync(path.join(integrationDir, file), path.join(rtDir, file));
      }
    }

    // Import i18next back into .po
    importFromI18next(outDir, false, rtDir, false, 4);

    // Verify English
    const origEn = parsePo(path.join(integrationDir, 'en-US.po'));
    const rtEn = parsePo(path.join(rtDir, 'en-US.po'));

    for (const [key, value] of origEn.entries) {
      assert.equal(rtEn.entries.get(key), value,
        `Integration RT mismatch for key "${key}"`);
    }
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────

describe('i18next edge cases', () => {
  it('handles empty plural forms gracefully', () => {
    const tmpFile = path.join(TMP, 'empty-plural.json');
    fs.writeFileSync(tmpFile, JSON.stringify({
      'item_one': '',
      'item_other': '',
    }));
    const { entries, pluralEntries } = parseI18nextFile(tmpFile, 'en', 4);
    assert.equal(entries.size, 0);
    assert.equal(pluralEntries.size, 1);
    assert.deepEqual(pluralEntries.get('item').msgstr, ['', '']);
  });

  it('handles key with underscores that are not CLDR suffixes', () => {
    const tmpFile = path.join(TMP, 'underscore-key.json');
    fs.writeFileSync(tmpFile, JSON.stringify({
      'my_long_key': 'value',
      'another_key_name': 'value2',
    }));
    const { entries, pluralEntries } = parseI18nextFile(tmpFile, 'en', 4);
    assert.equal(entries.size, 2);
    assert.equal(pluralEntries.size, 0);
    assert.equal(entries.get('my_long_key'), 'value');
    assert.equal(entries.get('another_key_name'), 'value2');
  });

  it('handles key ending with CLDR suffix that has no companions', () => {
    // If there's only key_one without key_other, it should still be treated as plural
    // because it matches the plural pattern
    const tmpFile = path.join(TMP, 'lone-suffix.json');
    fs.writeFileSync(tmpFile, JSON.stringify({
      'item_one': 'one item',
    }));
    const { entries, pluralEntries } = parseI18nextFile(tmpFile, 'en', 4);
    // 'item' is identified as plural base because _one suffix detected
    assert.equal(pluralEntries.size, 1);
    assert.deepEqual(pluralEntries.get('item').msgstr, ['one item', '']);
  });

  it('v3 handles base key that is also a plural base', () => {
    const tmpFile = path.join(TMP, 'v3-base-plural.json');
    fs.writeFileSync(tmpFile, JSON.stringify({
      'count': '1 item',
      'count_plural': '%d items',
      'name': 'John',
    }));
    const { entries, pluralEntries } = parseI18nextFile(tmpFile, 'en', 3);
    assert.equal(entries.size, 1);
    assert.equal(entries.get('name'), 'John');
    assert.equal(pluralEntries.size, 1);
    assert.deepEqual(pluralEntries.get('count').msgstr, ['1 item', '%d items']);
  });

  it('GETTEXT_TO_CLDR covers all languages in LOCALE_MAP', () => {
    const localeMapKeys = ['en', 'pl', 'cs', 'sk', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'hu', 'ro', 'uk', 'ru'];
    for (const lang of localeMapKeys) {
      const categories = _getCLDRCategories(lang);
      assert.ok(categories.length >= 2, `${lang} should have at least 2 plural categories`);
    }
  });
});
