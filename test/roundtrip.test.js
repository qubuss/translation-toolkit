/**
 * Tests for export → import round-trip, including multi-line and msgctxt.
 *
 * Run: node --test test/roundtrip.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parsePo, patchPoFile, extractMeta, discoverPoFiles } = require('../lib/poParser');
const { exportToCsv } = require('../lib/export');
const { importFromCsv } = require('../lib/import');

const FIXTURES = path.join(__dirname, 'fixtures');
const TMP = path.join(__dirname, '.tmp-roundtrip');

before(() => {
  fs.mkdirSync(TMP, { recursive: true });
  // Copy fixtures to tmp so import can write there
  for (const f of fs.readdirSync(FIXTURES)) {
    if (f.endsWith('.po')) {
      fs.copyFileSync(path.join(FIXTURES, f), path.join(TMP, f));
    }
  }
});

after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

// ─── Export → Import round-trip ──────────────────────────

describe('export → import round-trip', () => {
  it('preserves all entries through CSV round-trip', async () => {
    // 1. Parse original .po files
    const poFiles = discoverPoFiles(TMP);
    const originalData = new Map();
    for (const pf of poFiles) {
      const { entries } = parsePo(pf.filePath);
      originalData.set(pf.shortCode, new Map(entries));
    }

    // 2. Export to CSV
    const csvPath = path.join(TMP, 'test-export.csv');
    await exportToCsv(csvPath, TMP, '|');

    // 3. Verify CSV was created
    assert.ok(fs.existsSync(csvPath), 'CSV file should exist');

    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const csvLines = csvContent.split('\n').filter((l) => l.trim());
    assert.ok(csvLines.length > 1, 'CSV should have header + data rows');

    // 4. Verify header contains key and language columns
    const header = csvLines[0];
    assert.ok(header.startsWith('key|'), 'CSV should start with key|');
    assert.ok(header.includes('en'), 'CSV should contain en column');
    assert.ok(header.includes('pl'), 'CSV should contain pl column');

    // 5. Verify msgctxt entries use :: separator in CSV
    assert.ok(
      csvContent.includes('menu::Open'),
      'CSV should use :: separator for msgctxt entries'
    );
    assert.ok(
      csvContent.includes('button::Open'),
      'CSV should contain button::Open'
    );

    // 6. Import CSV back (replace mode)
    await importFromCsv(csvPath, false, TMP, '|');

    // 7. Parse the re-imported .po files
    const reimported = new Map();
    for (const pf of discoverPoFiles(TMP)) {
      const { entries } = parsePo(pf.filePath);
      reimported.set(pf.shortCode, entries);
    }

    // 8. Compare: same keys and values
    for (const [lang, originalEntries] of originalData) {
      const newEntries = reimported.get(lang);
      assert.ok(newEntries, `Language ${lang} should exist after import`);
      assert.equal(newEntries.size, originalEntries.size,
        `${lang}: entry count should match (expected ${originalEntries.size}, got ${newEntries.size})`);

      for (const [key, value] of originalEntries) {
        const displayKey = key.replace('\x04', '::');
        assert.equal(newEntries.get(key), value,
          `${lang}: value mismatch for key "${displayKey}"`);
      }
    }
  });

  it('CSV contains multi-line values properly quoted', async () => {
    const csvPath = path.join(TMP, 'test-export.csv');
    // Re-export to ensure fresh file
    await exportToCsv(csvPath, TMP, '|');

    const csvContent = fs.readFileSync(csvPath, 'utf-8');

    // Multi-line values should be quoted in CSV
    // "with.newlines" has embedded \n which should be in quoted field
    assert.ok(
      csvContent.includes('"'),
      'CSV should have quoted fields for multi-line values'
    );
  });
});

// ─── :: separator handling ───────────────────────────────

describe(':: separator for msgctxt', () => {
  it('export converts \\x04 to :: and import converts back', async () => {
    const csvPath = path.join(TMP, 'ctx-test.csv');
    await exportToCsv(csvPath, TMP, '|');

    const content = fs.readFileSync(csvPath, 'utf-8');

    // Should NOT contain raw \x04
    assert.equal(content.includes('\x04'), false, 'CSV should not contain \\x04');

    // Should contain :: notation
    assert.ok(content.includes('menu::Open'), 'Should have menu::Open in CSV');
    assert.ok(content.includes('button::Open'), 'Should have button::Open in CSV');

    // Import back
    await importFromCsv(csvPath, false, TMP, '|');

    // Verify \x04 is restored in parsed entries
    const { entries } = parsePo(path.join(TMP, 'en-US.po'));
    assert.ok(entries.has('menu\x04Open'), 'Should have menu\\x04Open after re-import');
    assert.ok(entries.has('button\x04Open'), 'Should have button\\x04Open after re-import');
  });
});

// ─── Dry-run mode ────────────────────────────────────────

describe('import --dry-run', () => {
  it('does not modify .po files in dry-run mode', async () => {
    // Get original file contents
    const enPath = path.join(TMP, 'en-US.po');
    const plPath = path.join(TMP, 'pl-PL.po');
    const originalEn = fs.readFileSync(enPath, 'utf-8');
    const originalPl = fs.readFileSync(plPath, 'utf-8');

    // Create a CSV with a changed value
    const csvPath = path.join(TMP, 'dryrun-test.csv');
    await exportToCsv(csvPath, TMP, '|');

    // Modify CSV: add a new key
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    fs.writeFileSync(csvPath, csvContent + 'brand.new.key|New Value|Nowa Wartość\n');

    // Import with dry-run
    await importFromCsv(csvPath, false, TMP, '|', true);

    // Files should be unchanged
    assert.equal(fs.readFileSync(enPath, 'utf-8'), originalEn, 'en-US.po should not be modified in dry-run');
    assert.equal(fs.readFileSync(plPath, 'utf-8'), originalPl, 'pl-PL.po should not be modified in dry-run');
  });

  it('dry-run reports added/changed/removed counts', async () => {
    // Capture console output
    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    const csvPath = path.join(TMP, 'dryrun-report.csv');
    await exportToCsv(csvPath, TMP, '|');

    // Modify CSV: add a new key
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    fs.writeFileSync(csvPath, csvContent + 'brand.new.key|Added|Dodano\n');

    await importFromCsv(csvPath, false, TMP, '|', true);
    console.log = origLog;

    const output = logs.join('\n');
    assert.ok(output.includes('DRY RUN'), 'Should mention DRY RUN');
    assert.ok(output.includes('Would update'), 'Should say "Would update"');
    assert.ok(output.includes('+1 added'), 'Should report added keys');
  });
});

// ─── Plural forms round-trip ─────────────────────────────

describe('plural forms round-trip', () => {
  it('export preserves plural entries as key[N] rows', async () => {
    const csvPath = path.join(TMP, 'plural-export.csv');
    await exportToCsv(csvPath, TMP, '|');

    const content = fs.readFileSync(csvPath, 'utf-8');
    // Check key[N] rows exist
    assert.ok(content.includes('%d file[0]'), 'Should have %d file[0] row');
    assert.ok(content.includes('%d file[1]'), 'Should have %d file[1] row');
    assert.ok(content.includes('%d file[2]'), 'Should have %d file[2] row');
    // Check msgctxt plural
    assert.ok(content.includes('notifications::You have %d new message[0]'), 'Should have ctx plural[0]');
    assert.ok(content.includes('notifications::You have %d new message[1]'), 'Should have ctx plural[1]');
    // Check multiline plural is quoted
    assert.ok(content.includes('%d day remaining[0]'), 'Should have multiline plural[0]');
  });

  it('export matches fixture CSV content', async () => {
    const csvPath = path.join(TMP, 'plural-match.csv');
    await exportToCsv(csvPath, TMP, '|');

    const exported = fs.readFileSync(csvPath, 'utf-8');
    const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'translations.csv'), 'utf-8');
    assert.equal(exported, fixture, 'Exported CSV should match fixture');
  });

  it('import preserves plural entries through round-trip', async () => {
    // 1. Parse original plural entries
    const originalEn = parsePo(path.join(TMP, 'en-US.po'));
    const originalPl = parsePo(path.join(TMP, 'pl-PL.po'));

    // 2. Export to CSV
    const csvPath = path.join(TMP, 'plural-roundtrip.csv');
    await exportToCsv(csvPath, TMP, '|');

    // 3. Import back
    await importFromCsv(csvPath, false, TMP, '|');

    // 4. Parse re-imported files
    const reimportedEn = parsePo(path.join(TMP, 'en-US.po'));
    const reimportedPl = parsePo(path.join(TMP, 'pl-PL.po'));

    // 5. Compare plural entries
    assert.equal(reimportedEn.pluralEntries.size, originalEn.pluralEntries.size,
      'en plural count should match');
    assert.equal(reimportedPl.pluralEntries.size, originalPl.pluralEntries.size,
      'pl plural count should match');

    for (const [key, original] of originalEn.pluralEntries) {
      const reimported = reimportedEn.pluralEntries.get(key);
      assert.ok(reimported, `en should have plural key: ${key.replace('\x04', '::')}`);
      assert.deepEqual(reimported.msgstr, original.msgstr,
        `en msgstr mismatch for: ${key.replace('\x04', '::')}`);
    }

    for (const [key, original] of originalPl.pluralEntries) {
      const reimported = reimportedPl.pluralEntries.get(key);
      assert.ok(reimported, `pl should have plural key: ${key.replace('\x04', '::')}`);
      assert.deepEqual(reimported.msgstr, original.msgstr,
        `pl msgstr mismatch for: ${key.replace('\x04', '::')}`);
    }
  });

  it('import updates modified plural forms correctly', async () => {
    // Export, modify a plural form, import back
    const csvPath = path.join(TMP, 'plural-modify.csv');
    await exportToCsv(csvPath, TMP, '|');

    // Modify %d file[1] for pl: "%d pliki" → "%d pliki ROUNDTRIP"
    let csvContent = fs.readFileSync(csvPath, 'utf-8');
    csvContent = csvContent.replace(
      '%d file[1]|%d files|%d pliki',
      '%d file[1]|%d files|%d pliki ROUNDTRIP'
    );
    fs.writeFileSync(csvPath, csvContent);

    await importFromCsv(csvPath, false, TMP, '|');

    const pl = parsePo(path.join(TMP, 'pl-PL.po'));
    const entry = pl.pluralEntries.get('%d file');
    assert.equal(entry.msgstr[0], '%d plik', 'Form 0 unchanged');
    assert.equal(entry.msgstr[1], '%d pliki ROUNDTRIP', 'Form 1 modified');
    assert.equal(entry.msgstr[2], '%d plików', 'Form 2 unchanged');

    // Singular entries should be intact
    assert.equal(pl.entries.get('simple.key'), 'Prosta wartość');
  });

  it('export reports plural count in log', async () => {
    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    const csvPath = path.join(TMP, 'plural-log.csv');
    await exportToCsv(csvPath, TMP, '|');
    console.log = origLog;

    const output = logs.join('\n');
    assert.ok(output.includes('4 plural'), 'Should report 4 plural keys');
    assert.ok(output.includes('54 keys'), 'Should report 54 total keys (50 + 4)');
  });

  it('import reports plural count in log', async () => {
    const csvPath = path.join(TMP, 'plural-import-log.csv');
    await exportToCsv(csvPath, TMP, '|');

    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    await importFromCsv(csvPath, false, TMP, '|');
    console.log = origLog;

    const output = logs.join('\n');
    assert.ok(output.includes('4 plural'), 'Should report 4 plural keys');
    assert.ok(output.includes('50 singular'), 'Should report 50 singular keys');
  });

  it('CSV does NOT contain raw \\x04 in plural rows', async () => {
    const csvPath = path.join(TMP, 'plural-no-eot.csv');
    await exportToCsv(csvPath, TMP, '|');

    const content = fs.readFileSync(csvPath, 'utf-8');
    // Check plural rows with msgctxt use :: not \x04
    assert.equal(content.includes('\x04'), false, 'CSV should not contain \\x04');
    assert.ok(content.includes('notifications::You have %d new message[0]'),
      'Should use :: separator for msgctxt plural keys');
  });
});
