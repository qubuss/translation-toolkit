/**
 * Tests for JSON format export/import (Phase 3.1).
 *
 * Covers:
 * - exportToJson: .po → per-language JSON files
 * - importFromJson: JSON → .po files (patch + create)
 * - Round-trip: .po → JSON → .po preservation
 * - Nested JSON auto-flatten on import
 * - Plural forms as arrays
 * - msgctxt keys with :: separator
 * - CLI --format json integration
 * - Helper functions (_flattenObject, _isNested, key converters)
 *
 * Run: node --test test/jsonFormat.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parsePo, discoverPoFiles } = require('../lib/poParser');
const {
  exportToJson,
  importFromJson,
  parseJsonFile,
  discoverJsonFiles,
  _flattenObject,
  _isNested,
  _internalKeyToJson,
  _jsonKeyToInternal,
} = require('../lib/jsonFormat');

const FIXTURES = path.join(__dirname, 'fixtures');
const TMP = path.join(__dirname, '.tmp-json');
const BIN = path.join(__dirname, '..', 'bin', 'translation-toolkit.js');

before(() => {
  fs.mkdirSync(TMP, { recursive: true });
});

after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

// ── Helper functions ────────────────────────────────────────────────────

describe('JSON format helpers', () => {
  it('_internalKeyToJson converts \\x04 to ::', () => {
    assert.equal(_internalKeyToJson('menu\x04Save'), 'menu::Save');
    assert.equal(_internalKeyToJson('simple.key'), 'simple.key');
  });

  it('_jsonKeyToInternal converts :: to \\x04', () => {
    assert.equal(_jsonKeyToInternal('menu::Save'), 'menu\x04Save');
    assert.equal(_jsonKeyToInternal('simple.key'), 'simple.key');
  });

  it('_isNested detects nested objects', () => {
    assert.equal(_isNested({ a: 'x' }), false);
    assert.equal(_isNested({ a: ['x', 'y'] }), false);
    assert.equal(_isNested({ a: { b: 'x' } }), true);
  });

  it('_flattenObject flattens nested objects with dot separator', () => {
    const input = {
      menu: {
        save: 'Save',
        open: 'Open',
      },
      simple: 'value',
    };
    const flat = _flattenObject(input);
    assert.deepEqual(flat, {
      'menu.save': 'Save',
      'menu.open': 'Open',
      'simple': 'value',
    });
  });

  it('_flattenObject preserves arrays (plurals)', () => {
    const input = {
      common: {
        files: ['%d file', '%d files'],
      },
      title: 'Hello',
    };
    const flat = _flattenObject(input);
    assert.deepEqual(flat, {
      'common.files': ['%d file', '%d files'],
      'title': 'Hello',
    });
  });

  it('_flattenObject handles deeply nested objects', () => {
    const input = { a: { b: { c: { d: 'deep' } } } };
    const flat = _flattenObject(input);
    assert.deepEqual(flat, { 'a.b.c.d': 'deep' });
  });
});

// ── Export to JSON ──────────────────────────────────────────────────────

describe('exportToJson', () => {
  const jsonDir = path.join(TMP, 'export');

  before(() => {
    fs.mkdirSync(jsonDir, { recursive: true });
    exportToJson(jsonDir, FIXTURES);
  });

  it('creates one JSON file per language', () => {
    assert.ok(fs.existsSync(path.join(jsonDir, 'en.json')));
    assert.ok(fs.existsSync(path.join(jsonDir, 'pl.json')));
  });

  it('JSON contains all singular keys as strings', () => {
    const en = JSON.parse(fs.readFileSync(path.join(jsonDir, 'en.json'), 'utf-8'));
    assert.equal(typeof en['simple.key'], 'string');
    assert.equal(en['simple.key'], 'Simple value');
    assert.equal(en['another.key'], 'Another value');
  });

  it('JSON contains plural keys as arrays', () => {
    const en = JSON.parse(fs.readFileSync(path.join(jsonDir, 'en.json'), 'utf-8'));
    assert.ok(Array.isArray(en['%d file']), 'plural should be an array');
    assert.equal(en['%d file'].length, 2);
    assert.equal(en['%d file'][0], '%d file');
    assert.equal(en['%d file'][1], '%d files');
  });

  it('msgctxt keys use :: separator', () => {
    const en = JSON.parse(fs.readFileSync(path.join(jsonDir, 'en.json'), 'utf-8'));
    assert.ok('menu::Open' in en, 'should have menu::Open key');
    assert.ok('button::Open' in en, 'should have button::Open key');
  });

  it('Polish file has 3 plural forms', () => {
    const pl = JSON.parse(fs.readFileSync(path.join(jsonDir, 'pl.json'), 'utf-8'));
    assert.ok(Array.isArray(pl['%d file']), 'plural should be an array');
    assert.equal(pl['%d file'].length, 3, 'Polish has 3 plural forms');
  });

  it('empty values are preserved as empty strings', () => {
    const en = JSON.parse(fs.readFileSync(path.join(jsonDir, 'en.json'), 'utf-8'));
    assert.equal(en['empty.value'], '');
  });

  it('multi-line values are preserved', () => {
    const en = JSON.parse(fs.readFileSync(path.join(jsonDir, 'en.json'), 'utf-8'));
    const longKey = 'This is a very long string that needs to be wrapped across multiple lines for readability.';
    assert.ok(longKey in en, 'long key should exist');
  });

  it('produces valid JSON (parseable)', () => {
    const raw = fs.readFileSync(path.join(jsonDir, 'en.json'), 'utf-8');
    assert.doesNotThrow(() => JSON.parse(raw));
  });

  it('JSON is pretty-printed with 2-space indent', () => {
    const raw = fs.readFileSync(path.join(jsonDir, 'en.json'), 'utf-8');
    assert.ok(raw.includes('  "'), 'should be indented with 2 spaces');
  });
});

// ── parseJsonFile ───────────────────────────────────────────────────────

describe('parseJsonFile', () => {
  it('parses flat JSON into entries and plural entries', () => {
    const jsonPath = path.join(TMP, 'parse-test.json');
    fs.writeFileSync(jsonPath, JSON.stringify({
      'greeting': 'Hello',
      'farewell': 'Goodbye',
      '%d item': ['%d item', '%d items'],
    }), 'utf-8');

    const { entries, pluralEntries } = parseJsonFile(jsonPath);
    assert.equal(entries.size, 2);
    assert.equal(entries.get('greeting'), 'Hello');
    assert.equal(pluralEntries.size, 1);
    assert.deepEqual(pluralEntries.get('%d item').msgstr, ['%d item', '%d items']);
  });

  it('auto-flattens nested JSON', () => {
    const jsonPath = path.join(TMP, 'parse-nested.json');
    fs.writeFileSync(jsonPath, JSON.stringify({
      menu: { save: 'Save', open: 'Open' },
      title: 'Hello',
    }), 'utf-8');

    const { entries } = parseJsonFile(jsonPath);
    assert.equal(entries.get('menu.save'), 'Save');
    assert.equal(entries.get('menu.open'), 'Open');
    assert.equal(entries.get('title'), 'Hello');
  });

  it('converts :: keys to internal \\x04 separator', () => {
    const jsonPath = path.join(TMP, 'parse-ctx.json');
    fs.writeFileSync(jsonPath, JSON.stringify({
      'menu::Save': 'Save file',
    }), 'utf-8');

    const { entries } = parseJsonFile(jsonPath);
    assert.ok(entries.has('menu\x04Save'));
    assert.equal(entries.get('menu\x04Save'), 'Save file');
  });

  it('skips _status metadata key', () => {
    const jsonPath = path.join(TMP, 'parse-status.json');
    fs.writeFileSync(jsonPath, JSON.stringify({
      'greeting': 'Hello',
      '_status': { 'greeting': 'fuzzy' },
    }), 'utf-8');

    const { entries } = parseJsonFile(jsonPath);
    assert.equal(entries.size, 1);
    assert.ok(!entries.has('_status'));
  });
});

// ── discoverJsonFiles ───────────────────────────────────────────────────

describe('discoverJsonFiles', () => {
  it('discovers language JSON files in directory', () => {
    const dir = path.join(TMP, 'discover');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'en.json'), '{}');
    fs.writeFileSync(path.join(dir, 'pl.json'), '{}');
    fs.writeFileSync(path.join(dir, 'de.json'), '{}');

    const files = discoverJsonFiles(dir);
    assert.equal(files.length, 3);
    const codes = files.map((f) => f.shortCode).sort();
    assert.deepEqual(codes, ['de', 'en', 'pl']);
  });

  it('skips non-language JSON files', () => {
    const dir = path.join(TMP, 'discover-skip');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'en.json'), '{}');
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{}');
    fs.writeFileSync(path.join(dir, '.hidden.json'), '{}');

    const files = discoverJsonFiles(dir);
    assert.equal(files.length, 1);
    assert.equal(files[0].shortCode, 'en');
  });

  it('returns empty array for non-existent directory', () => {
    assert.deepEqual(discoverJsonFiles('/tmp/nonexistent-dir-xyz'), []);
  });
});

// ── Export matches fixture ───────────────────────────────────────────────

describe('JSON export matches fixture files', () => {
  const fixtureJsonDir = path.join(FIXTURES, 'json');
  const matchDir = path.join(TMP, 'fixture-match');
  const matchJsonDir = path.join(matchDir, 'json');
  const matchPoDir = path.join(matchDir, 'po');

  before(() => {
    fs.mkdirSync(matchPoDir, { recursive: true });
    fs.mkdirSync(matchJsonDir, { recursive: true });
    for (const f of fs.readdirSync(FIXTURES)) {
      if (f.endsWith('.po')) {
        fs.copyFileSync(path.join(FIXTURES, f), path.join(matchPoDir, f));
      }
    }
    exportToJson(matchJsonDir, matchPoDir);
  });

  it('exported en.json matches fixture', () => {
    const exported = fs.readFileSync(path.join(matchJsonDir, 'en.json'), 'utf-8');
    const fixture = fs.readFileSync(path.join(fixtureJsonDir, 'en.json'), 'utf-8');
    assert.equal(exported, fixture, 'Exported en.json should match fixture');
  });

  it('exported pl.json matches fixture', () => {
    const exported = fs.readFileSync(path.join(matchJsonDir, 'pl.json'), 'utf-8');
    const fixture = fs.readFileSync(path.join(fixtureJsonDir, 'pl.json'), 'utf-8');
    assert.equal(exported, fixture, 'Exported pl.json should match fixture');
  });
});

// ── Round-trip: .po → JSON → .po ───────────────────────────────────────

describe('JSON round-trip', () => {
  const rtDir = path.join(TMP, 'roundtrip');
  const rtPoDir = path.join(rtDir, 'po');
  const rtJsonDir = path.join(rtDir, 'json');

  before(() => {
    fs.mkdirSync(rtPoDir, { recursive: true });
    fs.mkdirSync(rtJsonDir, { recursive: true });
    // Copy fixtures
    for (const f of fs.readdirSync(FIXTURES)) {
      if (f.endsWith('.po')) {
        fs.copyFileSync(path.join(FIXTURES, f), path.join(rtPoDir, f));
      }
    }
  });

  it('preserves all singular entries through JSON round-trip', () => {
    // Parse originals
    const origData = new Map();
    for (const pf of discoverPoFiles(rtPoDir)) {
      const { entries } = parsePo(pf.filePath);
      origData.set(pf.shortCode, new Map(entries));
    }

    // Export to JSON
    exportToJson(rtJsonDir, rtPoDir);

    // Import back
    importFromJson(rtJsonDir, false, rtPoDir);

    // Compare
    for (const pf of discoverPoFiles(rtPoDir)) {
      const { entries } = parsePo(pf.filePath);
      const orig = origData.get(pf.shortCode);
      assert.equal(entries.size, orig.size, `${pf.shortCode} should have same number of entries`);
      for (const [key, value] of orig) {
        assert.equal(entries.get(key), value, `${pf.shortCode} key "${key}" should match`);
      }
    }
  });

  it('preserves all plural entries through JSON round-trip', () => {
    const origData = new Map();
    for (const pf of discoverPoFiles(rtPoDir)) {
      const { pluralEntries } = parsePo(pf.filePath);
      origData.set(pf.shortCode, new Map(pluralEntries));
    }

    exportToJson(rtJsonDir, rtPoDir);
    importFromJson(rtJsonDir, false, rtPoDir);

    for (const pf of discoverPoFiles(rtPoDir)) {
      const { pluralEntries } = parsePo(pf.filePath);
      const orig = origData.get(pf.shortCode);
      assert.equal(pluralEntries.size, orig.size, `${pf.shortCode} plural count`);
      for (const [key, entry] of orig) {
        const reimEntry = pluralEntries.get(key);
        assert.ok(reimEntry, `${pf.shortCode} plural key "${key}" should exist`);
        assert.deepEqual(reimEntry.msgstr, entry.msgstr, `${pf.shortCode} plural "${key}" forms`);
      }
    }
  });

  it('preserves msgctxt entries through round-trip', () => {
    const { entries: origEntries } = parsePo(path.join(rtPoDir, 'en-US.po'));
    const ctxKeys = [...origEntries.keys()].filter((k) => k.includes('\x04'));
    assert.ok(ctxKeys.length > 0, 'should have msgctxt entries in fixtures');

    exportToJson(rtJsonDir, rtPoDir);
    importFromJson(rtJsonDir, false, rtPoDir);

    const { entries: reimEntries } = parsePo(path.join(rtPoDir, 'en-US.po'));
    for (const key of ctxKeys) {
      assert.equal(reimEntries.get(key), origEntries.get(key), `msgctxt key should match: ${key}`);
    }
  });
});

// ── Import nested JSON ──────────────────────────────────────────────────

describe('import nested JSON', () => {
  it('auto-flattens nested JSON and imports to .po', () => {
    const nestedDir = path.join(TMP, 'nested');
    const nestedPoDir = path.join(nestedDir, 'po');
    const nestedJsonDir = path.join(nestedDir, 'json');
    fs.mkdirSync(nestedPoDir, { recursive: true });
    fs.mkdirSync(nestedJsonDir, { recursive: true });

    // Copy fixtures
    for (const f of fs.readdirSync(FIXTURES)) {
      if (f.endsWith('.po')) {
        fs.copyFileSync(path.join(FIXTURES, f), path.join(nestedPoDir, f));
      }
    }

    // Write nested JSON
    const nestedJson = {
      menu: {
        save: 'Save File',
        open: 'Open File',
      },
      common: {
        buttons: {
          ok: 'OK',
          cancel: 'Cancel',
        },
      },
    };
    fs.writeFileSync(path.join(nestedJsonDir, 'en.json'), JSON.stringify(nestedJson));

    // Import with merge mode (keep existing keys)
    importFromJson(nestedJsonDir, true, nestedPoDir);

    const { entries } = parsePo(path.join(nestedPoDir, 'en-US.po'));
    assert.equal(entries.get('menu.save'), 'Save File');
    assert.equal(entries.get('menu.open'), 'Open File');
    assert.equal(entries.get('common.buttons.ok'), 'OK');
    assert.equal(entries.get('common.buttons.cancel'), 'Cancel');
    // Original keys should still be there (merge mode)
    assert.equal(entries.get('simple.key'), 'Simple value');
  });
});

// ── CLI integration ─────────────────────────────────────────────────────

describe('CLI --format json', () => {
  const cliDir = path.join(TMP, 'cli');
  const cliJsonDir = path.join(cliDir, 'json');
  const cliPoDir = path.join(cliDir, 'po');

  before(() => {
    fs.mkdirSync(cliJsonDir, { recursive: true });
    fs.mkdirSync(cliPoDir, { recursive: true });
    for (const f of fs.readdirSync(FIXTURES)) {
      if (f.endsWith('.po')) {
        fs.copyFileSync(path.join(FIXTURES, f), path.join(cliPoDir, f));
      }
    }
  });

  it('export --format json produces JSON files', () => {
    execFileSync(process.execPath, [BIN, 'export', '--format', 'json', '-o', cliJsonDir, '--dir', cliPoDir, '--ci']);
    assert.ok(fs.existsSync(path.join(cliJsonDir, 'en.json')));
    assert.ok(fs.existsSync(path.join(cliJsonDir, 'pl.json')));
    const en = JSON.parse(fs.readFileSync(path.join(cliJsonDir, 'en.json'), 'utf-8'));
    assert.equal(en['simple.key'], 'Simple value');
  });

  it('import --format json reads JSON files', () => {
    // First export to get valid JSON
    execFileSync(process.execPath, [BIN, 'export', '--format', 'json', '-o', cliJsonDir, '--dir', cliPoDir, '--ci']);

    // Then import back with dry-run
    const output = execFileSync(process.execPath, [BIN, 'import', '--format', 'json', cliJsonDir, '--dir', cliPoDir, '--ci', '--dry-run'], { encoding: 'utf-8' });
    assert.ok(output.includes('JSON file(s)'), 'should mention JSON files');
    assert.ok(output.includes('Dry run complete'), 'should complete dry run');
  });

  it('export --format csv still works (default behavior)', () => {
    const csvPath = path.join(cliDir, 'test.csv');
    execFileSync(process.execPath, [BIN, 'export', '-o', csvPath, '--dir', cliPoDir, '--ci']);
    assert.ok(fs.existsSync(csvPath));
    const content = fs.readFileSync(csvPath, 'utf-8');
    assert.ok(content.startsWith('key|'));
  });

  it('export --format unknown exits with error', () => {
    assert.throws(() => {
      execFileSync(process.execPath, [BIN, 'export', '--format', 'xml', '--dir', cliPoDir, '--ci'], { encoding: 'utf-8' });
    }, (err) => {
      assert.ok(err.stderr.includes('Unknown format'));
      return true;
    });
  });

  it('import --format unknown exits with error', () => {
    assert.throws(() => {
      execFileSync(process.execPath, [BIN, 'import', '--format', 'yaml', cliJsonDir, '--dir', cliPoDir, '--ci'], { encoding: 'utf-8' });
    }, (err) => {
      assert.ok(err.stderr.includes('Unknown format'));
      return true;
    });
  });
});

// ── Integration project fixture match ────────────────────────────────────

describe('JSON integration project matches fixture files', () => {
  const intFixtures = path.join(__dirname, 'integration-project', 'translations');
  const intFixtureJson = path.join(__dirname, 'integration-project', 'json');
  const intMatchDir = path.join(TMP, 'int-fixture-match');
  const intMatchJsonDir = path.join(intMatchDir, 'json');
  const intMatchPoDir = path.join(intMatchDir, 'po');

  before(() => {
    if (!fs.existsSync(intFixtures)) return;
    fs.mkdirSync(intMatchPoDir, { recursive: true });
    fs.mkdirSync(intMatchJsonDir, { recursive: true });
    for (const f of fs.readdirSync(intFixtures)) {
      if (f.endsWith('.po')) {
        fs.copyFileSync(path.join(intFixtures, f), path.join(intMatchPoDir, f));
      }
    }
    exportToJson(intMatchJsonDir, intMatchPoDir);
  });

  for (const lang of ['en', 'pl', 'de']) {
    it(`exported ${lang}.json matches integration fixture`, () => {
      if (!fs.existsSync(intFixtures)) return;
      const exported = fs.readFileSync(path.join(intMatchJsonDir, `${lang}.json`), 'utf-8');
      const fixture = fs.readFileSync(path.join(intFixtureJson, `${lang}.json`), 'utf-8');
      assert.equal(exported, fixture, `Exported ${lang}.json should match integration fixture`);
    });
  }
});

// ── Integration: 3-language project ─────────────────────────────────────

describe('JSON format with integration project', () => {
  const intFixtures = path.join(__dirname, 'integration-project', 'translations');
  const intDir = path.join(TMP, 'integration');
  const intPoDir = path.join(intDir, 'po');
  const intJsonDir = path.join(intDir, 'json');

  before(() => {
    if (!fs.existsSync(intFixtures)) return;
    fs.mkdirSync(intPoDir, { recursive: true });
    fs.mkdirSync(intJsonDir, { recursive: true });
    for (const f of fs.readdirSync(intFixtures)) {
      if (f.endsWith('.po')) {
        fs.copyFileSync(path.join(intFixtures, f), path.join(intPoDir, f));
      }
    }
  });

  it('exports 3-language project to JSON', () => {
    if (!fs.existsSync(intFixtures)) return; // skip if no integration project
    exportToJson(intJsonDir, intPoDir);
    assert.ok(fs.existsSync(path.join(intJsonDir, 'en.json')));
    assert.ok(fs.existsSync(path.join(intJsonDir, 'pl.json')));
    assert.ok(fs.existsSync(path.join(intJsonDir, 'de.json')));
  });

  it('round-trips 3-language project through JSON', () => {
    if (!fs.existsSync(intFixtures)) return;

    // Parse originals
    const origData = new Map();
    for (const pf of discoverPoFiles(intPoDir)) {
      const { entries, pluralEntries } = parsePo(pf.filePath);
      origData.set(pf.shortCode, { entries: new Map(entries), pluralEntries: new Map(pluralEntries) });
    }

    exportToJson(intJsonDir, intPoDir);
    importFromJson(intJsonDir, false, intPoDir);

    // Compare all languages
    for (const pf of discoverPoFiles(intPoDir)) {
      const { entries, pluralEntries } = parsePo(pf.filePath);
      const orig = origData.get(pf.shortCode);
      assert.equal(entries.size, orig.entries.size, `${pf.shortCode} singular count`);
      for (const [key, value] of orig.entries) {
        assert.equal(entries.get(key), value, `${pf.shortCode} key "${_internalKeyToJson(key)}"`);
      }
      assert.equal(pluralEntries.size, orig.pluralEntries.size, `${pf.shortCode} plural count`);
    }
  });
});
