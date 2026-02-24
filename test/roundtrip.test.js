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
      'simple.key||Simple value|Prosta wartość',
      'simple.key||Updated value|Zaktualizowana wartość'
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

    // Add a new key (include empty _status column)
    let csvContent = fs.readFileSync(csvPath, 'utf-8');
    csvContent += 'brand.new.key||Brand New|Nowiutki\n';
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

    // Modify %d file[1] for pl: "%d pliki" \u2192 "%d pliki ROUNDTRIP" (skip _status column)
    let csvContent = fs.readFileSync(csvPath, 'utf-8');
    csvContent = csvContent.replace(
      '%d file[1]||%d files|%d pliki',
      '%d file[1]||%d files|%d pliki ROUNDTRIP'
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

// ─── Fuzzy _status column ─────────────────────────────────

describe('fuzzy _status column in CSV export', () => {
  const STATUS_TMP = path.join(__dirname, '.tmp-status');

  before(() => {
    fs.mkdirSync(STATUS_TMP, { recursive: true });
    for (const f of fs.readdirSync(FIXTURES)) {
      if (f.endsWith('.po')) {
        fs.copyFileSync(path.join(FIXTURES, f), path.join(STATUS_TMP, f));
      }
    }
  });

  after(() => {
    fs.rmSync(STATUS_TMP, { recursive: true, force: true });
  });

  it('export includes _status column in header by default', async () => {
    const csvPath = path.join(STATUS_TMP, 'status-header.csv');
    await exportToCsv(csvPath, STATUS_TMP, '|');

    const content = fs.readFileSync(csvPath, 'utf-8');
    const header = content.split('\n')[0];
    assert.equal(header, 'key|_status|en|pl', 'Header should include _status column');
  });

  it('fuzzy entries have _status=fuzzy', async () => {
    const csvPath = path.join(STATUS_TMP, 'status-fuzzy.csv');
    await exportToCsv(csvPath, STATUS_TMP, '|');

    const content = fs.readFileSync(csvPath, 'utf-8');
    // Fixtures have 3 fuzzy entries: commented.entry, fuzzy.entry, new.key.name
    assert.ok(content.includes('commented.entry|fuzzy|'), 'commented.entry should be fuzzy');
    assert.ok(content.includes('fuzzy.entry|fuzzy|'), 'fuzzy.entry should be fuzzy');
    assert.ok(content.includes('new.key.name|fuzzy|'), 'new.key.name should be fuzzy');
  });

  it('non-fuzzy entries have empty _status', async () => {
    const csvPath = path.join(STATUS_TMP, 'status-nonfuzzy.csv');
    await exportToCsv(csvPath, STATUS_TMP, '|');

    const content = fs.readFileSync(csvPath, 'utf-8');
    assert.ok(content.includes('simple.key||Simple value'), 'simple.key should have empty status');
    assert.ok(content.includes('another.key||Another value'), 'another.key should have empty status');
  });

  it('includeStatus: false omits the _status column', async () => {
    const csvPath = path.join(STATUS_TMP, 'no-status.csv');
    await exportToCsv(csvPath, STATUS_TMP, '|', { includeStatus: false });

    const content = fs.readFileSync(csvPath, 'utf-8');
    const header = content.split('\n')[0];
    assert.equal(header, 'key|en|pl', 'Header should NOT include _status column');
    assert.ok(!content.includes('|fuzzy|'), 'No fuzzy status values');
    assert.ok(!content.includes('_status'), 'No _status anywhere');
  });

  it('export log reports fuzzy count', async () => {
    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    const csvPath = path.join(STATUS_TMP, 'status-log.csv');
    await exportToCsv(csvPath, STATUS_TMP, '|');
    console.log = origLog;

    const output = logs.join('\n');
    assert.ok(output.includes('3 fuzzy'), 'Should report 3 fuzzy keys');
  });

  it('import correctly handles CSV with _status column (round-trip)', async () => {
    // Export (has _status column), then immediately import back
    const csvPath = path.join(STATUS_TMP, 'status-roundtrip.csv');
    await exportToCsv(csvPath, STATUS_TMP, '|');

    // Parse originals before import
    const originalEn = parsePo(path.join(STATUS_TMP, 'en-US.po'));
    const originalPl = parsePo(path.join(STATUS_TMP, 'pl-PL.po'));

    // Import CSV with _status column
    await importFromCsv(csvPath, false, STATUS_TMP, '|');

    // Verify all entries preserved
    const enParsed = parsePo(path.join(STATUS_TMP, 'en-US.po'));
    const plParsed = parsePo(path.join(STATUS_TMP, 'pl-PL.po'));
    assert.equal(enParsed.entries.size, originalEn.entries.size,
      'en entry count should match after status round-trip');
    assert.equal(plParsed.entries.size, originalPl.entries.size,
      'pl entry count should match after status round-trip');

    // Check specific entries not corrupted
    assert.equal(enParsed.entries.get('simple.key'), 'Simple value');
    assert.equal(enParsed.entries.get('fuzzy.entry'), 'This translation needs review: %s');
  });

  it('import handles CSV without _status column (backwards compat)', async () => {
    // Re-copy .po originals (previous test may have imported)
    for (const f of fs.readdirSync(FIXTURES)) {
      if (f.endsWith('.po')) {
        fs.copyFileSync(path.join(FIXTURES, f), path.join(STATUS_TMP, f));
      }
    }

    // Export without status, then import
    const csvPath = path.join(STATUS_TMP, 'no-status-import.csv');
    await exportToCsv(csvPath, STATUS_TMP, '|', { includeStatus: false });

    const originalEn = parsePo(path.join(STATUS_TMP, 'en-US.po'));
    await importFromCsv(csvPath, false, STATUS_TMP, '|');

    const enParsed = parsePo(path.join(STATUS_TMP, 'en-US.po'));
    assert.equal(enParsed.entries.size, originalEn.entries.size,
      'entry count should match after no-status import');
  });

  it('comma delimiter export includes _status column', async () => {
    const csvPath = path.join(STATUS_TMP, 'status-comma.csv');
    await exportToCsv(csvPath, STATUS_TMP, ',');

    const content = fs.readFileSync(csvPath, 'utf-8');
    const header = content.split('\n')[0];
    assert.ok(header.startsWith('key,_status,'), 'Comma-delimited header should include _status');
    assert.ok(content.includes(',fuzzy,'), 'Fuzzy status should be present');
  });

  it('plural fuzzy entries get _status=fuzzy on all key[N] rows', async () => {
    // Create a temp dir with a .po that has a fuzzy plural entry
    const tmpDir = path.join(STATUS_TMP, 'fuzzy-plural');
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'en-US.po'), [
      'msgid ""',
      'msgstr ""',
      '"Language: en\\n"',
      '"Content-Type: text/plain; charset=UTF-8\\n"',
      '"Plural-Forms: nplurals=2; plural=(n != 1);\\n"',
      '',
      '#, fuzzy',
      'msgid "%d cat"',
      'msgid_plural "%d cats"',
      'msgstr[0] "%d cat"',
      'msgstr[1] "%d cats"',
      '',
      'msgid "clean"',
      'msgstr "Clean entry"',
      ''
    ].join('\n'));

    const csvPath = path.join(tmpDir, 'export.csv');
    await exportToCsv(csvPath, tmpDir, '|');

    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    // Find plural rows — all should be fuzzy
    const catRows = lines.filter(l => l.includes('%d cat['));
    assert.equal(catRows.length, 2, 'Should have 2 plural rows');
    for (const row of catRows) {
      assert.ok(row.includes('|fuzzy|'), `Plural row should have fuzzy status: ${row}`);
    }

    // Clean entry should NOT be fuzzy
    const cleanRow = lines.find(l => l.startsWith('clean|'));
    assert.ok(cleanRow, 'Should have clean entry');
    assert.ok(cleanRow.includes('clean||'), 'Clean entry should have empty status');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ─── F2: Fuzzy import (unfuzzy / add fuzzy) ─────────────

describe('fuzzy import — unfuzzy and add fuzzy via _status column', () => {
  const FUZZY_TMP = path.join(__dirname, '.tmp-fuzzy-import');

  before(() => {
    fs.mkdirSync(FUZZY_TMP, { recursive: true });
  });

  after(() => {
    fs.rmSync(FUZZY_TMP, { recursive: true, force: true });
  });

  /**
   * Helper: create a minimal .po + export → CSV → modify status → import → parse result.
   */
  function writeFuzzyPo(dir, filename, entries) {
    const lines = [
      'msgid ""',
      'msgstr ""',
      '"Language: en\\n"',
      '"Content-Type: text/plain; charset=UTF-8\\n"',
      '"Plural-Forms: nplurals=2; plural=(n != 1);\\n"',
      '',
    ];
    for (const e of entries) {
      if (e.fuzzy) lines.push('#, fuzzy');
      if (e.comment) lines.push(e.comment);
      if (e.msgctxt) lines.push(`msgctxt "${e.msgctxt}"`);
      lines.push(`msgid "${e.msgid}"`);
      if (e.msgid_plural) {
        lines.push(`msgid_plural "${e.msgid_plural}"`);
        for (let n = 0; n < e.msgstr.length; n++) {
          lines.push(`msgstr[${n}] "${e.msgstr[n]}"`);
        }
      } else {
        lines.push(`msgstr "${e.msgstr}"`);
      }
      lines.push('');
    }
    fs.writeFileSync(path.join(dir, filename), lines.join('\n'));
  }

  it('unfuzzy: clearing _status removes #, fuzzy from .po', async () => {
    const dir = path.join(FUZZY_TMP, 'unfuzzy1');
    fs.mkdirSync(dir, { recursive: true });
    writeFuzzyPo(dir, 'en-US.po', [
      { msgid: 'reviewed', msgstr: 'Reviewed text', fuzzy: true },
      { msgid: 'still.fuzzy', msgstr: 'Still fuzzy', fuzzy: true },
      { msgid: 'clean', msgstr: 'Clean' },
    ]);

    // Export (will have _status column)
    const csvPath = path.join(dir, 'export.csv');
    await exportToCsv(csvPath, dir, '|');

    // Modify CSV: clear fuzzy status for 'reviewed', keep 'still.fuzzy'
    let csv = fs.readFileSync(csvPath, 'utf-8');
    csv = csv.replace('reviewed|fuzzy|', 'reviewed||');
    fs.writeFileSync(csvPath, csv);

    // Import
    await importFromCsv(csvPath, false, dir, '|');

    // Verify
    const content = fs.readFileSync(path.join(dir, 'en-US.po'), 'utf-8');
    const parsed = parsePo(path.join(dir, 'en-US.po'));

    assert.ok(!parsed.fuzzyKeys.has('reviewed'), 'reviewed should no longer be fuzzy');
    assert.ok(parsed.fuzzyKeys.has('still.fuzzy'), 'still.fuzzy should remain fuzzy');
    assert.ok(!parsed.fuzzyKeys.has('clean'), 'clean should not be fuzzy');

    // Verify the #, fuzzy line was actually removed from file
    const reviewedIdx = content.indexOf('msgid "reviewed"');
    const beforeReviewed = content.slice(Math.max(0, reviewedIdx - 50), reviewedIdx);
    assert.ok(!beforeReviewed.includes('#, fuzzy'), '#, fuzzy should be removed before reviewed entry');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('add fuzzy: setting _status=fuzzy adds #, fuzzy to clean entry', async () => {
    const dir = path.join(FUZZY_TMP, 'addfuzzy1');
    fs.mkdirSync(dir, { recursive: true });
    writeFuzzyPo(dir, 'en-US.po', [
      { msgid: 'make.fuzzy', msgstr: 'Will become fuzzy' },
      { msgid: 'keep.clean', msgstr: 'Stays clean' },
    ]);

    const csvPath = path.join(dir, 'export.csv');
    await exportToCsv(csvPath, dir, '|');

    // Modify CSV: add fuzzy status
    let csv = fs.readFileSync(csvPath, 'utf-8');
    csv = csv.replace('make.fuzzy||', 'make.fuzzy|fuzzy|');
    fs.writeFileSync(csvPath, csv);

    await importFromCsv(csvPath, false, dir, '|');

    const parsed = parsePo(path.join(dir, 'en-US.po'));
    assert.ok(parsed.fuzzyKeys.has('make.fuzzy'), 'make.fuzzy should now be fuzzy');
    assert.ok(!parsed.fuzzyKeys.has('keep.clean'), 'keep.clean should remain clean');

    // Verify #, fuzzy was added to file
    const content = fs.readFileSync(path.join(dir, 'en-US.po'), 'utf-8');
    const makeIdx = content.indexOf('msgid "make.fuzzy"');
    const beforeMake = content.slice(Math.max(0, makeIdx - 30), makeIdx);
    assert.ok(beforeMake.includes('#, fuzzy'), '#, fuzzy should be present before make.fuzzy');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('unfuzzy preserves other flags on #, line (e.g. c-format)', async () => {
    const dir = path.join(FUZZY_TMP, 'otherflags');
    fs.mkdirSync(dir, { recursive: true });

    // Write .po with #, fuzzy, c-format
    const poContent = [
      'msgid ""',
      'msgstr ""',
      '"Language: en\\n"',
      '"Content-Type: text/plain; charset=UTF-8\\n"',
      '',
      '#, fuzzy, c-format',
      'msgid "formatted"',
      'msgstr "Value %s"',
      ''
    ].join('\n');
    fs.writeFileSync(path.join(dir, 'en-US.po'), poContent);

    const csvPath = path.join(dir, 'export.csv');
    await exportToCsv(csvPath, dir, '|');

    // Clear fuzzy status
    let csv = fs.readFileSync(csvPath, 'utf-8');
    csv = csv.replace('formatted|fuzzy|', 'formatted||');
    fs.writeFileSync(csvPath, csv);

    await importFromCsv(csvPath, false, dir, '|');

    const content = fs.readFileSync(path.join(dir, 'en-US.po'), 'utf-8');
    const parsed = parsePo(path.join(dir, 'en-US.po'));

    assert.ok(!parsed.fuzzyKeys.has('formatted'), 'should no longer be fuzzy');
    // c-format flag should be preserved
    assert.ok(content.includes('#, c-format'), 'c-format flag should be preserved');
    assert.ok(!content.includes('fuzzy'), 'fuzzy should be completely removed');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('unfuzzy works for plural entries', async () => {
    const dir = path.join(FUZZY_TMP, 'plural-unfuzzy');
    fs.mkdirSync(dir, { recursive: true });
    writeFuzzyPo(dir, 'en-US.po', [
      { msgid: '%d item', msgid_plural: '%d items', msgstr: ['%d item', '%d items'], fuzzy: true },
      { msgid: 'plain', msgstr: 'Plain' },
    ]);

    const csvPath = path.join(dir, 'export.csv');
    await exportToCsv(csvPath, dir, '|');

    // Clear fuzzy status for plural key
    let csv = fs.readFileSync(csvPath, 'utf-8');
    csv = csv.replace('%d item[0]|fuzzy|', '%d item[0]||');
    csv = csv.replace('%d item[1]|fuzzy|', '%d item[1]||');
    fs.writeFileSync(csvPath, csv);

    await importFromCsv(csvPath, false, dir, '|');

    const parsed = parsePo(path.join(dir, 'en-US.po'));
    assert.ok(!parsed.fuzzyKeys.has('%d item'), 'plural entry should no longer be fuzzy');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('no fuzzy changes when CSV has no _status column', async () => {
    const dir = path.join(FUZZY_TMP, 'no-status-col');
    fs.mkdirSync(dir, { recursive: true });
    writeFuzzyPo(dir, 'en-US.po', [
      { msgid: 'stays.fuzzy', msgstr: 'Should stay fuzzy', fuzzy: true },
      { msgid: 'clean', msgstr: 'Clean' },
    ]);

    // Export WITHOUT status column
    const csvPath = path.join(dir, 'export.csv');
    await exportToCsv(csvPath, dir, '|', { includeStatus: false });

    await importFromCsv(csvPath, false, dir, '|');

    const parsed = parsePo(path.join(dir, 'en-US.po'));
    // Fuzzy flag should be untouched — no status column means no changes
    assert.ok(parsed.fuzzyKeys.has('stays.fuzzy'), 'fuzzy should be preserved when no _status column');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('round-trip: export with status → import preserves fuzzy flags', async () => {
    const dir = path.join(FUZZY_TMP, 'roundtrip-fuzzy');
    fs.mkdirSync(dir, { recursive: true });
    writeFuzzyPo(dir, 'en-US.po', [
      { msgid: 'fuzzy.one', msgstr: 'Fuzzy 1', fuzzy: true },
      { msgid: 'fuzzy.two', msgstr: 'Fuzzy 2', fuzzy: true },
      { msgid: 'clean.one', msgstr: 'Clean 1' },
    ]);

    // Export → import unchanged → verify fuzzy flags preserved
    const csvPath = path.join(dir, 'export.csv');
    await exportToCsv(csvPath, dir, '|');
    await importFromCsv(csvPath, false, dir, '|');

    const parsed = parsePo(path.join(dir, 'en-US.po'));
    assert.ok(parsed.fuzzyKeys.has('fuzzy.one'), 'fuzzy.one should remain fuzzy');
    assert.ok(parsed.fuzzyKeys.has('fuzzy.two'), 'fuzzy.two should remain fuzzy');
    assert.ok(!parsed.fuzzyKeys.has('clean.one'), 'clean.one should remain clean');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('import log reports fuzzy info when _status column present', async () => {
    const dir = path.join(FUZZY_TMP, 'log-count');
    fs.mkdirSync(dir, { recursive: true });
    writeFuzzyPo(dir, 'en-US.po', [
      { msgid: 'reviewed', msgstr: 'Reviewed', fuzzy: true },
      { msgid: 'clean', msgstr: 'Clean' },
    ]);

    const csvPath = path.join(dir, 'export.csv');
    await exportToCsv(csvPath, dir, '|');

    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    await importFromCsv(csvPath, false, dir, '|');
    console.log = origLog;

    const output = logs.join('\n');
    // Should report _status column detection
    assert.ok(output.includes('_status column'), 'Should report _status column detected');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('multi-language: unfuzzy removes flag from all language files', async () => {
    const dir = path.join(FUZZY_TMP, 'multi-lang');
    fs.mkdirSync(dir, { recursive: true });

    // English: reviewed is fuzzy
    writeFuzzyPo(dir, 'en-US.po', [
      { msgid: 'reviewed', msgstr: 'Reviewed EN', fuzzy: true },
      { msgid: 'clean', msgstr: 'Clean EN' },
    ]);
    // Polish: reviewed is also fuzzy
    const plContent = [
      'msgid ""',
      'msgstr ""',
      '"Language: pl\\n"',
      '"Content-Type: text/plain; charset=UTF-8\\n"',
      '"Plural-Forms: nplurals=3; plural=(n==1 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);\\n"',
      '',
      '#, fuzzy',
      'msgid "reviewed"',
      'msgstr "Przejrzane PL"',
      '',
      'msgid "clean"',
      'msgstr "Czyste PL"',
      ''
    ].join('\n');
    fs.writeFileSync(path.join(dir, 'pl-PL.po'), plContent);

    const csvPath = path.join(dir, 'export.csv');
    await exportToCsv(csvPath, dir, '|');

    // Clear fuzzy
    let csv = fs.readFileSync(csvPath, 'utf-8');
    csv = csv.replace('reviewed|fuzzy|', 'reviewed||');
    fs.writeFileSync(csvPath, csv);

    await importFromCsv(csvPath, false, dir, '|');

    const enParsed = parsePo(path.join(dir, 'en-US.po'));
    const plParsed = parsePo(path.join(dir, 'pl-PL.po'));
    assert.ok(!enParsed.fuzzyKeys.has('reviewed'), 'en: reviewed should no longer be fuzzy');
    assert.ok(!plParsed.fuzzyKeys.has('reviewed'), 'pl: reviewed should no longer be fuzzy');

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
