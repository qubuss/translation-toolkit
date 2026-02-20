/**
 * Tests for export → import round-trip, including multi-line and msgctxt.
 *
 * Run: node --test test/roundtrip.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parsePo, extractMeta, discoverPoFiles } = require('../lib/poParser');
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
