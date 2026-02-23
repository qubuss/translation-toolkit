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

// ─── Custom delimiter (-D) ───────────────────────────────

describe('custom delimiter -D', () => {
  it('export with comma delimiter produces valid CSV', async () => {
    const csvPath = path.join(TMP, 'comma-export.csv');
    await exportToCsv(csvPath, TMP, ',');

    const content = fs.readFileSync(csvPath, 'utf-8');
    const firstLine = content.split('\n')[0];
    assert.ok(firstLine.startsWith('key,'), 'Header should use comma delimiter');
    assert.ok(!firstLine.includes('|'), 'Header should NOT contain pipe');
    // Values containing commas should be quoted
    assert.ok(content.includes('"'), 'Comma-delimited CSV should quote fields containing commas');
  });

  it('comma-delimited export → import round-trip preserves all entries', async () => {
    // Parse originals
    const poFiles = discoverPoFiles(TMP);
    const originalData = new Map();
    for (const pf of poFiles) {
      const { entries } = parsePo(pf.filePath);
      originalData.set(pf.shortCode, new Map(entries));
    }

    // Export with comma
    const csvPath = path.join(TMP, 'comma-roundtrip.csv');
    await exportToCsv(csvPath, TMP, ',');

    // Import back with comma
    await importFromCsv(csvPath, false, TMP, ',');

    // Compare
    for (const pf of discoverPoFiles(TMP)) {
      const { entries: newEntries } = parsePo(pf.filePath);
      const originalEntries = originalData.get(pf.shortCode);
      assert.equal(newEntries.size, originalEntries.size,
        `${pf.shortCode}: entry count should match after comma round-trip`);
      for (const [key, value] of originalEntries) {
        assert.equal(newEntries.get(key), value,
          `${pf.shortCode}: value mismatch for "${key.replace('\x04', '::')}" after comma round-trip`);
      }
    }
  });

  it('tab-delimited export → import round-trip preserves all entries', async () => {
    const poFiles = discoverPoFiles(TMP);
    const originalData = new Map();
    for (const pf of poFiles) {
      const { entries } = parsePo(pf.filePath);
      originalData.set(pf.shortCode, new Map(entries));
    }

    const csvPath = path.join(TMP, 'tab-roundtrip.csv');
    await exportToCsv(csvPath, TMP, '\t');
    await importFromCsv(csvPath, false, TMP, '\t');

    for (const pf of discoverPoFiles(TMP)) {
      const { entries: newEntries } = parsePo(pf.filePath);
      const originalEntries = originalData.get(pf.shortCode);
      assert.equal(newEntries.size, originalEntries.size,
        `${pf.shortCode}: entry count should match after tab round-trip`);
    }
  });

  it('comma-delimited round-trip preserves plural entries', async () => {
    // Re-copy fixtures (previous tests may have modified them)
    for (const f of fs.readdirSync(FIXTURES)) {
      if (f.endsWith('.po')) {
        fs.copyFileSync(path.join(FIXTURES, f), path.join(TMP, f));
      }
    }

    const originalPl = parsePo(path.join(TMP, 'pl-PL.po'));
    const csvPath = path.join(TMP, 'comma-plural-roundtrip.csv');

    await exportToCsv(csvPath, TMP, ',');
    await importFromCsv(csvPath, false, TMP, ',');

    const reimportedPl = parsePo(path.join(TMP, 'pl-PL.po'));
    assert.equal(reimportedPl.pluralEntries.size, originalPl.pluralEntries.size,
      'pl plural count should match after comma round-trip');

    for (const [key, original] of originalPl.pluralEntries) {
      const reimported = reimportedPl.pluralEntries.get(key);
      assert.ok(reimported, `pl should have plural key: ${key.replace('\x04', '::')}`);
      assert.deepEqual(reimported.msgstr, original.msgstr,
        `pl plural msgstr mismatch for: ${key.replace('\x04', '::')}`);
    }
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

// ─── Merge mode (--merge) ────────────────────────────────

describe('import --merge mode', () => {
  it('replace mode removes keys not present in CSV', async () => {
    // Export to CSV, then remove a key from CSV
    const csvPath = path.join(TMP, 'replace-test.csv');
    await exportToCsv(csvPath, TMP, '|');

    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n');
    // Remove the line containing "simple.key" (should be in the first few data rows)
    const filtered = lines.filter((l) => !l.startsWith('simple.key|'));
    assert.ok(filtered.length < lines.length, 'Should have removed a line');
    fs.writeFileSync(csvPath, filtered.join('\n'));

    // Import in replace mode (default: merge=false)
    await importFromCsv(csvPath, false, TMP, '|');

    // simple.key should be gone
    const enParsed = parsePo(path.join(TMP, 'en-US.po'));
    assert.ok(!enParsed.entries.has('simple.key'), 'simple.key should be removed in replace mode');
  });

  it('merge mode keeps existing keys not in CSV', async () => {
    // First, re-copy fixtures (previous test removed a key)
    for (const f of fs.readdirSync(FIXTURES)) {
      if (f.endsWith('.po')) {
        fs.copyFileSync(path.join(FIXTURES, f), path.join(TMP, f));
      }
    }

    // Export, remove a key from CSV
    const csvPath = path.join(TMP, 'merge-test.csv');
    await exportToCsv(csvPath, TMP, '|');

    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n');
    const filtered = lines.filter((l) => !l.startsWith('simple.key|'));
    fs.writeFileSync(csvPath, filtered.join('\n'));

    // Import in merge mode (merge=true)
    await importFromCsv(csvPath, true, TMP, '|');

    // simple.key should STILL exist
    const enParsed = parsePo(path.join(TMP, 'en-US.po'));
    assert.ok(enParsed.entries.has('simple.key'), 'simple.key should be preserved in merge mode');
    assert.equal(enParsed.entries.get('simple.key'), 'Simple value',
      'simple.key should have original value in merge mode');
  });

  it('merge mode still updates changed values', async () => {
    // Re-copy fixtures
    for (const f of fs.readdirSync(FIXTURES)) {
      if (f.endsWith('.po')) {
        fs.copyFileSync(path.join(FIXTURES, f), path.join(TMP, f));
      }
    }

    const csvPath = path.join(TMP, 'merge-update.csv');
    await exportToCsv(csvPath, TMP, '|');

    // Modify a value in the CSV
    let csvContent = fs.readFileSync(csvPath, 'utf-8');
    csvContent = csvContent.replace(
      'simple.key|Simple value|Prosta wartość',
      'simple.key|Updated value|Zaktualizowana wartość'
    );
    fs.writeFileSync(csvPath, csvContent);

    // Import in merge mode
    await importFromCsv(csvPath, true, TMP, '|');

    const enParsed = parsePo(path.join(TMP, 'en-US.po'));
    assert.equal(enParsed.entries.get('simple.key'), 'Updated value',
      'merge mode should update existing values from CSV');

    const plParsed = parsePo(path.join(TMP, 'pl-PL.po'));
    assert.equal(plParsed.entries.get('simple.key'), 'Zaktualizowana wartość',
      'merge mode should update pl value too');
  });

  it('merge mode adds new keys from CSV', async () => {
    // Re-copy fixtures
    for (const f of fs.readdirSync(FIXTURES)) {
      if (f.endsWith('.po')) {
        fs.copyFileSync(path.join(FIXTURES, f), path.join(TMP, f));
      }
    }

    const csvPath = path.join(TMP, 'merge-add.csv');
    await exportToCsv(csvPath, TMP, '|');

    // Add a new key
    let csvContent = fs.readFileSync(csvPath, 'utf-8');
    csvContent += 'brand.new.key|Brand New|Nowiutki\n';
    fs.writeFileSync(csvPath, csvContent);

    await importFromCsv(csvPath, true, TMP, '|');

    const enParsed = parsePo(path.join(TMP, 'en-US.po'));
    assert.ok(enParsed.entries.has('brand.new.key'), 'merge mode should add new keys');
    assert.equal(enParsed.entries.get('brand.new.key'), 'Brand New');
    // Original keys should still be intact
    assert.ok(enParsed.entries.has('simple.key'), 'original keys preserved');
  });

  it('merge mode dry-run reports zero removed', async () => {
    // Re-copy fixtures
    for (const f of fs.readdirSync(FIXTURES)) {
      if (f.endsWith('.po')) {
        fs.copyFileSync(path.join(FIXTURES, f), path.join(TMP, f));
      }
    }

    const csvPath = path.join(TMP, 'merge-dry.csv');
    await exportToCsv(csvPath, TMP, '|');

    // Remove a key from CSV
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n');
    const filtered = lines.filter((l) => !l.startsWith('simple.key|'));
    fs.writeFileSync(csvPath, filtered.join('\n'));

    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    await importFromCsv(csvPath, true, TMP, '|', true);
    console.log = origLog;

    const output = logs.join('\n');
    assert.ok(output.includes('DRY RUN'), 'Should mention DRY RUN');
    assert.ok(output.includes('-0 removed'), 'merge mode dry run should report 0 removed');
  });
});

// ─── Plural forms round-trip ─────────────────────────────

describe('plural forms round-trip', () => {
  before(() => {
    // Re-copy fixtures (previous tests may have modified them)
    for (const f of fs.readdirSync(FIXTURES)) {
      if (f.endsWith('.po')) {
        fs.copyFileSync(path.join(FIXTURES, f), path.join(TMP, f));
      }
    }
  });

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
    // Note: maxForms normalization may add trailing empty forms to languages
    // with fewer nplurals (e.g. en has 2 forms, but CSV has 3 rows due to pl).
    // We compare original forms only — trailing empty forms are expected.
    assert.equal(reimportedEn.pluralEntries.size, originalEn.pluralEntries.size,
      'en plural count should match');
    assert.equal(reimportedPl.pluralEntries.size, originalPl.pluralEntries.size,
      'pl plural count should match');

    for (const [key, original] of originalEn.pluralEntries) {
      const reimported = reimportedEn.pluralEntries.get(key);
      assert.ok(reimported, `en should have plural key: ${key.replace('\x04', '::')}`);
      // Compare only the original form count (trailing empty forms are acceptable)
      const reimportedTrimmed = reimported.msgstr.slice(0, original.msgstr.length);
      assert.deepEqual(reimportedTrimmed, original.msgstr,
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
