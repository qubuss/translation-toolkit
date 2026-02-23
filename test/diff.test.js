/**
 * Tests for the diff command including --exit-zero flag.
 *
 * Run: node --test test/diff.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');

const { computeDiff, parseCsvFile } = require('../lib/diff');

const CLI = path.resolve(__dirname, '..', 'bin', 'translation-toolkit.js');
const FIXTURES = path.resolve(__dirname, 'fixtures');
const CSV_ORIGINAL = path.join(FIXTURES, 'translations.csv');
const CSV_MODIFIED = path.join(FIXTURES, 'translations-modified.csv');

// ─── computeDiff unit tests ─────────────────────────────

describe('computeDiff()', () => {
  it('detects differences between two CSV files', () => {
    const oldData = parseCsvFile(CSV_ORIGINAL, '|');
    const newData = parseCsvFile(CSV_MODIFIED, '|');
    const result = computeDiff(oldData, newData);

    assert.ok(result.entries.length > 0, 'should find differences');
  });

  it('returns empty entries for identical data', () => {
    const data1 = parseCsvFile(CSV_ORIGINAL, '|');
    const data2 = parseCsvFile(CSV_ORIGINAL, '|');
    const result = computeDiff(data1, data2);

    assert.strictEqual(result.entries.length, 0, 'identical files should have no differences');
  });
});

// ─── CLI: diff exit codes ───────────────────────────────

describe('CLI diff exit codes', () => {
  it('exits with code 1 when differences found (default)', () => {
    assert.throws(
      () => {
        execFileSync(process.execPath, [CLI, 'diff', CSV_ORIGINAL, CSV_MODIFIED], {
          timeout: 10000,
          stdio: 'pipe',
        });
      },
      (err) => err.status === 1,
      'should exit with code 1 when files differ'
    );
  });

  it('exits with code 0 when --exit-zero is passed (even with diffs)', () => {
    const result = execFileSync(
      process.execPath,
      [CLI, 'diff', CSV_ORIGINAL, CSV_MODIFIED, '--exit-zero'],
      { timeout: 10000, stdio: 'pipe' }
    );

    // Should NOT throw — exit code 0
    assert.ok(true, '--exit-zero should prevent non-zero exit');
  });

  it('exits with code 0 when no differences (without --exit-zero)', () => {
    const result = execFileSync(
      process.execPath,
      [CLI, 'diff', CSV_ORIGINAL, CSV_ORIGINAL],
      { timeout: 10000, stdio: 'pipe' }
    );

    assert.ok(true, 'identical files should exit 0');
  });
});
