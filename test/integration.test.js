/**
 * Integration tests for a realistic multi-language e-commerce project.
 *
 * Uses test/integration-project/translations/ which has 3 languages (en, pl, de),
 * ~104 singular + 8 plural entries, 7 fuzzy per language, msgctxt, multiline,
 * HTML, Unicode, special chars, and edge cases.
 *
 * Run: node --test test/integration.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parsePo, patchPoFile, discoverPoFiles, writePo } = require('../lib/poParser');
const { exportToCsv } = require('../lib/export');
const { importFromCsv } = require('../lib/import');
const { validateTranslations } = require('../lib/validate');
const { computeStats } = require('../lib/stats');

const INTEG_DIR = path.join(__dirname, 'integration-project', 'translations');
const TMP = path.join(__dirname, '.tmp-integration');
const CLI = path.join(__dirname, '..', 'bin', 'translation-toolkit.js');

before(() => {
  fs.mkdirSync(TMP, { recursive: true });
  // Copy integration project to tmp for import tests
  const tmpTranslations = path.join(TMP, 'translations');
  fs.mkdirSync(tmpTranslations, { recursive: true });
  for (const f of fs.readdirSync(INTEG_DIR)) {
    if (f.endsWith('.po')) {
      fs.copyFileSync(path.join(INTEG_DIR, f), path.join(tmpTranslations, f));
    }
  }
});

after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════
// Parsing
// ═══════════════════════════════════════════════════════════

describe('integration: parse 3-language project', () => {
  it('discovers all 3 .po files', () => {
    const files = discoverPoFiles(INTEG_DIR);
    assert.equal(files.length, 3, 'should find 3 .po files');
    const codes = files.map((f) => f.shortCode).sort();
    assert.deepEqual(codes, ['de', 'en', 'pl']);
  });

  it('parses expected number of entries per language', () => {
    const files = discoverPoFiles(INTEG_DIR);
    for (const f of files) {
      const { entries, pluralEntries } = parsePo(f.filePath);
      assert.equal(entries.size, 104,
        `${f.shortCode}: expected 104 singular entries, got ${entries.size}`);
      assert.equal(pluralEntries.size, 8,
        `${f.shortCode}: expected 8 plural entries, got ${pluralEntries.size}`);
    }
  });

  it('detects fuzzy keys correctly', () => {
    const files = discoverPoFiles(INTEG_DIR);
    for (const f of files) {
      const { fuzzyKeys } = parsePo(f.filePath);
      assert.equal(fuzzyKeys.size, 7,
        `${f.shortCode}: expected 7 fuzzy keys, got ${fuzzyKeys.size}`);
      // Verify specific fuzzy keys
      assert.ok(fuzzyKeys.has('auth.register.terms'));
      assert.ok(fuzzyKeys.has('account.notifications'));
      assert.ok(fuzzyKeys.has('account.delete'));
      assert.ok(fuzzyKeys.has('promo.summer_sale'));
      assert.ok(fuzzyKeys.has('promo.coupon_applied'));
      assert.ok(fuzzyKeys.has('footer.copyright'));
      assert.ok(fuzzyKeys.has('footer.return_policy'));
    }
  });

  it('parses Polish multiline Plural-Forms header', () => {
    const plPath = path.join(INTEG_DIR, 'pl-PL.po');
    const content = fs.readFileSync(plPath, 'utf-8');
    // Polish Plural-Forms spans two lines in the header
    assert.ok(content.includes('"Plural-Forms: nplurals=3;'),
      'Polish file should have multiline Plural-Forms header');
  });

  it('parses msgctxt entries with \\x04 separator', () => {
    const files = discoverPoFiles(INTEG_DIR);
    for (const f of files) {
      const { entries } = parsePo(f.filePath);
      // header::title and footer::title should be separate keys
      assert.ok(entries.has('header\x04title'),
        `${f.shortCode}: should have header::title entry`);
      assert.ok(entries.has('footer\x04title'),
        `${f.shortCode}: should have footer::title entry`);
      // product.status::active and order.status::active
      assert.ok(entries.has('product.status\x04active'));
      assert.ok(entries.has('order.status\x04active'));
    }
  });

  it('parses plural entries with msgctxt', () => {
    const files = discoverPoFiles(INTEG_DIR);
    for (const f of files) {
      const { pluralEntries } = parsePo(f.filePath);
      const ctxKey = 'notifications\x04%d new notification';
      assert.ok(pluralEntries.has(ctxKey),
        `${f.shortCode}: should have notifications::plural entry`);
      const entry = pluralEntries.get(ctxKey);
      assert.equal(entry.msgctxt, 'notifications');
    }
  });
});

// ═══════════════════════════════════════════════════════════
// Export → Import round-trip
// ═══════════════════════════════════════════════════════════

describe('integration: export → import round-trip', () => {
  const csvPath = () => path.join(TMP, 'export.csv');
  const tmpDir = () => path.join(TMP, 'translations');

  it('exports all keys to CSV', async () => {
    await exportToCsv(csvPath(), INTEG_DIR, '|');
    assert.ok(fs.existsSync(csvPath()));

    const lines = fs.readFileSync(csvPath(), 'utf-8').split('\n').filter((l) => l.trim());
    const header = lines[0];
    // header: key|de|en|pl
    assert.ok(header.startsWith('key|'));
    assert.ok(header.includes('de'));
    assert.ok(header.includes('en'));
    assert.ok(header.includes('pl'));

    // 104 singular + 8 plurals with max 3 forms (pl) = 8*3 = 24 plural rows
    // Total data rows = 104 + 24 = 128, plus header = 129
    const dataRows = lines.length - 1;
    assert.ok(dataRows >= 128,
      `Expected at least 128 data rows, got ${dataRows}`);
  });

  it('CSV contains :: separator for msgctxt entries', async () => {
    const content = fs.readFileSync(csvPath(), 'utf-8');
    assert.ok(content.includes('header::title'));
    assert.ok(content.includes('footer::title'));
    assert.ok(content.includes('button::save'));
    assert.ok(content.includes('toast::save'));
  });

  it('CSV contains plural key[N] rows', async () => {
    const content = fs.readFileSync(csvPath(), 'utf-8');
    assert.ok(content.includes('%d product found[0]'));
    assert.ok(content.includes('%d product found[1]'));
    assert.ok(content.includes('%d product found[2]'), 'Polish has 3 forms');
    assert.ok(content.includes('notifications::%d new notification[0]'));
  });

  it('imports CSV back without errors', async () => {
    await importFromCsv(csvPath(), false, tmpDir(), '|');
    // Verify files still exist
    for (const lang of ['en-US.po', 'pl-PL.po', 'de-DE.po']) {
      assert.ok(fs.existsSync(path.join(tmpDir(), lang)));
    }
  });

  it('re-exported CSV matches original', async () => {
    const reexportPath = path.join(TMP, 'reexport.csv');
    await exportToCsv(reexportPath, tmpDir(), '|');
    const original = fs.readFileSync(csvPath(), 'utf-8');
    const reexported = fs.readFileSync(reexportPath, 'utf-8');
    assert.equal(reexported, original, 'CSV should be identical after round-trip');
  });

  it('singular entry values preserved after round-trip', async () => {
    const files = discoverPoFiles(tmpDir());
    for (const f of files) {
      const { entries } = parsePo(f.filePath);
      const origEntries = parsePo(path.join(INTEG_DIR,
        f.filePath.split('/').pop())).entries;

      for (const [key, val] of origEntries) {
        const displayKey = key.replace('\x04', '::');
        assert.equal(entries.get(key), val,
          `${f.shortCode}: mismatch for "${displayKey}"`);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════
// Custom delimiter round-trip
// ═══════════════════════════════════════════════════════════

describe('integration: custom delimiter round-trip', () => {
  it('comma delimiter round-trip is lossless', async () => {
    const commaCSV = path.join(TMP, 'comma-export.csv');
    await exportToCsv(commaCSV, INTEG_DIR, ',');

    const commaDir = path.join(TMP, 'comma-reimport');
    fs.mkdirSync(commaDir, { recursive: true });
    for (const f of fs.readdirSync(INTEG_DIR)) {
      if (f.endsWith('.po')) {
        fs.copyFileSync(path.join(INTEG_DIR, f), path.join(commaDir, f));
      }
    }

    await importFromCsv(commaCSV, false, commaDir, ',');
    const reCSV = path.join(TMP, 'comma-reexport.csv');
    await exportToCsv(reCSV, commaDir, ',');

    assert.equal(
      fs.readFileSync(reCSV, 'utf-8'),
      fs.readFileSync(commaCSV, 'utf-8'),
      'comma-delimited CSV should be identical after round-trip'
    );
  });
});

// ═══════════════════════════════════════════════════════════
// Merge mode
// ═══════════════════════════════════════════════════════════

describe('integration: merge vs replace mode', () => {
  it('replace mode removes missing keys', async () => {
    const replaceDir = path.join(TMP, 'replace-test');
    fs.mkdirSync(replaceDir, { recursive: true });
    for (const f of fs.readdirSync(INTEG_DIR)) {
      if (f.endsWith('.po')) {
        fs.copyFileSync(path.join(INTEG_DIR, f), path.join(replaceDir, f));
      }
    }

    // Create CSV with fewer keys (remove some lines)
    const csvPath = path.join(TMP, 'partial.csv');
    await exportToCsv(csvPath, INTEG_DIR, '|');
    const lines = fs.readFileSync(csvPath, 'utf-8').split('\n');
    // Remove lines 3-7 (some singular keys)
    const reduced = [lines[0], ...lines.slice(8)].join('\n');
    fs.writeFileSync(csvPath, reduced);

    await importFromCsv(csvPath, false, replaceDir, '|');

    const files = discoverPoFiles(replaceDir);
    const firstEntries = parsePo(files[0].filePath).entries;
    assert.ok(firstEntries.size < 104,
      'replace mode should have fewer keys than original');
  });

  it('merge mode preserves existing keys', async () => {
    const mergeDir = path.join(TMP, 'merge-test');
    fs.mkdirSync(mergeDir, { recursive: true });
    for (const f of fs.readdirSync(INTEG_DIR)) {
      if (f.endsWith('.po')) {
        fs.copyFileSync(path.join(INTEG_DIR, f), path.join(mergeDir, f));
      }
    }

    // Create CSV with fewer keys
    const csvPath = path.join(TMP, 'partial-merge.csv');
    await exportToCsv(csvPath, INTEG_DIR, '|');
    const lines = fs.readFileSync(csvPath, 'utf-8').split('\n');
    const reduced = [lines[0], ...lines.slice(8)].join('\n');
    fs.writeFileSync(csvPath, reduced);

    await importFromCsv(csvPath, true, mergeDir, '|'); // merge=true

    const files = discoverPoFiles(mergeDir);
    const firstEntries = parsePo(files[0].filePath).entries;
    assert.equal(firstEntries.size, 104,
      'merge mode should preserve all 104 keys');
  });
});

// ═══════════════════════════════════════════════════════════
// Validate
// ═══════════════════════════════════════════════════════════

describe('integration: validate', () => {
  it('reports 0 errors and 24 warnings (fuzzy + empty)', () => {
    const { issues } = validateTranslations(INTEG_DIR);
    const errors = issues.filter((r) => r.severity === 'error');
    const warnings = issues.filter((r) => r.severity === 'warning');

    assert.equal(errors.length, 0, 'should have 0 errors');
    // 3 empty (1 per lang) + 21 fuzzy (7 per lang) = 24 warnings
    assert.equal(warnings.length, 24,
      `expected 24 warnings, got ${warnings.length}`);
  });

  it('detects fuzzy-entry type for all fuzzy keys', () => {
    const { issues } = validateTranslations(INTEG_DIR);
    const fuzzyIssues = issues.filter((r) => r.type === 'fuzzy-entry');
    assert.equal(fuzzyIssues.length, 21, '7 fuzzy keys × 3 langs = 21');
  });

  it('detects empty-translation for common.coming_soon', () => {
    const { issues } = validateTranslations(INTEG_DIR);
    const empties = issues.filter((r) => r.type === 'empty-translation');
    assert.equal(empties.length, 3, '1 empty key × 3 langs');
    assert.ok(empties.every((e) => e.key === 'common.coming_soon'));
  });
});

// ═══════════════════════════════════════════════════════════
// Stats
// ═══════════════════════════════════════════════════════════

describe('integration: stats', () => {
  it('computes 99% coverage for all languages', () => {
    const stats = computeStats(INTEG_DIR);
    for (const s of stats.langStats) {
      assert.ok(s.coverage >= 99, `${s.lang}: coverage should be ≥99%, got ${s.coverage}`);
      assert.equal(s.pluralKeys, 8, `${s.lang}: should have 8 plural entries`);
    }
  });

  it('Polish has 24 plural forms (8 entries × 3 forms)', () => {
    const stats = computeStats(INTEG_DIR);
    const byLang = {};
    for (const s of stats.langStats) byLang[s.lang] = s;
    assert.equal(byLang.pl.pluralForms, 24, 'pl: 8 entries × 3 forms = 24');
    assert.equal(byLang.en.pluralForms, 16, 'en: 8 entries × 2 forms = 16');
    assert.equal(byLang.de.pluralForms, 16, 'de: 8 entries × 2 forms = 16');
  });
});

// ═══════════════════════════════════════════════════════════
// CLI integration (via execFileSync)
// ═══════════════════════════════════════════════════════════

describe('integration: CLI commands', () => {
  it('export produces correct output', () => {
    const csvOut = path.join(TMP, 'cli-export.csv');
    const out = execFileSync(process.execPath, [
      CLI, 'export', '--dir', INTEG_DIR, '-o', csvOut
    ], { encoding: 'utf-8' });

    assert.ok(out.includes('112 keys'));
    assert.ok(out.includes('8 plural'));
    assert.ok(out.includes('3 languages'));
    assert.ok(fs.existsSync(csvOut));
  });

  it('validate exits 0 (warnings only, no errors)', () => {
    const out = execFileSync(process.execPath, [
      CLI, 'validate', '--dir', INTEG_DIR
    ], { encoding: 'utf-8' });

    assert.ok(out.includes('0 errors'));
    assert.ok(out.includes('24 warnings'));
    assert.ok(out.includes('fuzzy'));
  });

  it('stats shows 3 languages with coverage', () => {
    const out = execFileSync(process.execPath, [
      CLI, 'stats', '--dir', INTEG_DIR
    ], { encoding: 'utf-8' });

    assert.ok(out.includes('DE'));
    assert.ok(out.includes('EN'));
    assert.ok(out.includes('PL'));
    assert.ok(out.includes('99%'));
    assert.ok(out.includes('Fuzzy'));
  });

  it('diff (CSV vs PO) shows no differences', () => {
    const csvOut = path.join(TMP, 'cli-diff.csv');
    execFileSync(process.execPath, [
      CLI, 'export', '--dir', INTEG_DIR, '-o', csvOut
    ], { encoding: 'utf-8' });

    const out = execFileSync(process.execPath, [
      CLI, 'diff', csvOut, '--dir', INTEG_DIR
    ], { encoding: 'utf-8' });

    assert.ok(out.includes('No differences'));
  });

  it('dry-run reports changes without modifying files', () => {
    const csvOut = path.join(TMP, 'cli-dryrun.csv');
    execFileSync(process.execPath, [
      CLI, 'export', '--dir', INTEG_DIR, '-o', csvOut
    ], { encoding: 'utf-8' });

    // Add a new key to CSV
    const content = fs.readFileSync(csvOut, 'utf-8');
    fs.writeFileSync(csvOut, content + 'NEW_KEY|neu|new|nowy\n');

    const dryRunDir = path.join(TMP, 'dryrun-dir');
    fs.mkdirSync(dryRunDir, { recursive: true });
    for (const f of fs.readdirSync(INTEG_DIR)) {
      if (f.endsWith('.po')) {
        fs.copyFileSync(path.join(INTEG_DIR, f), path.join(dryRunDir, f));
      }
    }

    const out = execFileSync(process.execPath, [
      CLI, 'import', csvOut, '--dir', dryRunDir, '--dry-run'
    ], { encoding: 'utf-8' });

    assert.ok(out.includes('DRY RUN'));

    // Verify files unchanged
    for (const f of fs.readdirSync(INTEG_DIR)) {
      if (f.endsWith('.po')) {
        const orig = fs.readFileSync(path.join(INTEG_DIR, f), 'utf-8');
        const after = fs.readFileSync(path.join(dryRunDir, f), 'utf-8');
        assert.equal(after, orig, `${f} should be unchanged after dry-run`);
      }
    }
  });

  it('static preview generates HTML file', () => {
    const htmlOut = path.join(TMP, 'preview.html');
    execFileSync(process.execPath, [
      CLI, 'preview', '--dir', INTEG_DIR, '--static', '-o', htmlOut
    ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });

    assert.ok(fs.existsSync(htmlOut));
    const html = fs.readFileSync(htmlOut, 'utf-8');
    assert.ok(html.includes('STATIC_MODE = true'));
    assert.ok(html.includes('nav.home'));
    assert.ok(html.includes('fuzzy-badge'));
    assert.ok(html.includes('plural'));
    assert.ok(html.length > 10000, 'HTML should be substantial');
  });
});

// ═══════════════════════════════════════════════════════════
// Format preservation
// ═══════════════════════════════════════════════════════════

describe('integration: format preservation', () => {
  it('comments are preserved byte-for-byte after round-trip', () => {
    const tmpRt = path.join(TMP, 'rt-format');
    fs.mkdirSync(tmpRt, { recursive: true });
    for (const f of fs.readdirSync(INTEG_DIR)) {
      if (f.endsWith('.po')) {
        fs.copyFileSync(path.join(INTEG_DIR, f), path.join(tmpRt, f));
      }
    }

    const csvPath = path.join(TMP, 'rt-format.csv');
    exportToCsv(csvPath, INTEG_DIR, '|');
    importFromCsv(csvPath, false, tmpRt, '|');

    // Check PLpolish file (most complex: multiline Plural-Forms, 3 plural forms)
    const origPl = fs.readFileSync(path.join(INTEG_DIR, 'pl-PL.po'), 'utf-8');
    const newPl = fs.readFileSync(path.join(tmpRt, 'pl-PL.po'), 'utf-8');
    assert.equal(newPl, origPl, 'Polish .po should be identical after round-trip');
  });

  it('blank line pattern is preserved', () => {
    const orig = fs.readFileSync(path.join(INTEG_DIR, 'en-US.po'), 'utf-8');
    const origBlanks = (orig.match(/^\s*$/gm) || []).length;

    const tmpRt = path.join(TMP, 'rt-blanks');
    fs.mkdirSync(tmpRt, { recursive: true });
    fs.copyFileSync(path.join(INTEG_DIR, 'en-US.po'), path.join(tmpRt, 'en-US.po'));
    fs.copyFileSync(path.join(INTEG_DIR, 'pl-PL.po'), path.join(tmpRt, 'pl-PL.po'));
    fs.copyFileSync(path.join(INTEG_DIR, 'de-DE.po'), path.join(tmpRt, 'de-DE.po'));

    const csvPath = path.join(TMP, 'rt-blanks.csv');
    exportToCsv(csvPath, INTEG_DIR, '|');
    importFromCsv(csvPath, false, tmpRt, '|');

    const newContent = fs.readFileSync(path.join(tmpRt, 'en-US.po'), 'utf-8');
    const newBlanks = (newContent.match(/^\s*$/gm) || []).length;
    assert.equal(newBlanks, origBlanks,
      `blank lines: original=${origBlanks}, after import=${newBlanks}`);
  });
});
