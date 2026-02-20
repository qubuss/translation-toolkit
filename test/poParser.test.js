/**
 * Tests for poParser.js — multi-line strings, msgctxt, round-trip, edge cases.
 *
 * Run: node --test test/poParser.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  parsePo,
  writePo,
  extractMeta,
  escapePo,
  unescapePo,
  formatPoString,
} = require('../lib/poParser');

const FIXTURES = path.join(__dirname, 'fixtures');
const TMP = path.join(__dirname, '.tmp');

// ─── Helpers ──────────────────────────────────────────────

before(() => {
  fs.mkdirSync(TMP, { recursive: true });
});

after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

// ─── escapePo / unescapePo ────────────────────────────────

describe('escapePo / unescapePo', () => {
  it('escapes and unescapes quotes', () => {
    assert.equal(escapePo('say "hello"'), 'say \\"hello\\"');
    assert.equal(unescapePo('say \\"hello\\"'), 'say "hello"');
  });

  it('escapes and unescapes backslashes', () => {
    assert.equal(escapePo('a\\b'), 'a\\\\b');
    assert.equal(unescapePo('a\\\\b'), 'a\\b');
  });

  it('escapes and unescapes newlines and tabs', () => {
    assert.equal(escapePo('line1\nline2'), 'line1\\nline2');
    assert.equal(escapePo('col1\tcol2'), 'col1\\tcol2');
    assert.equal(unescapePo('line1\\nline2'), 'line1\nline2');
    assert.equal(unescapePo('col1\\tcol2'), 'col1\tcol2');
  });

  it('round-trips complex strings', () => {
    const original = 'He said "hi\\there"\nNew line';
    assert.equal(unescapePo(escapePo(original)), original);
  });
});

// ─── formatPoString ───────────────────────────────────────

describe('formatPoString', () => {
  it('formats short strings on a single line', () => {
    const result = formatPoString('msgid', 'hello');
    assert.deepEqual(result, ['msgid "hello"']);
  });

  it('formats strings with newlines as multi-line', () => {
    const result = formatPoString('msgid', 'line1\nline2');
    assert.deepEqual(result, [
      'msgid ""',
      '"line1\\n"',
      '"line2"',
    ]);
  });

  it('wraps very long strings', () => {
    const long = 'a'.repeat(200);
    const result = formatPoString('msgid', long);
    // Should still be single line if no newlines (our implementation splits on \\n only)
    assert.equal(result.length, 2); // msgid "" + one continuation line
    assert.equal(result[0], 'msgid ""');
  });

  it('handles empty strings', () => {
    const result = formatPoString('msgstr', '');
    assert.deepEqual(result, ['msgstr ""']);
  });
});

// ─── parsePo — basic ─────────────────────────────────────

describe('parsePo — basic', () => {
  it('parses simple entries', () => {
    const { entries, header } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('simple.key'), 'Simple value');
  });

  it('parses header metadata', () => {
    const { header } = parsePo(path.join(FIXTURES, 'en-US.po'));
    const meta = extractMeta(header);
    assert.equal(meta.language, 'en-US');
    assert.ok(meta.pluralForms.includes('nplurals=2'));
  });

  it('parses empty msgstr', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('empty.value'), '');
  });

  it('parses special characters', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('special.chars'), 'Quotes: "hello" and backslash: \\ done');
  });
});

// ─── parsePo — multi-line ────────────────────────────────

describe('parsePo — multi-line strings', () => {
  it('joins continuation lines for msgid', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    const expected = 'This is a very long string that needs to be wrapped across multiple lines for readability.';
    assert.equal(entries.get(expected), expected);
  });

  it('joins continuation lines with embedded newlines', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('with.newlines'), 'First line\nSecond line\nThird line');
  });

  it('parses Polish multi-line translations', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'pl-PL.po'));
    assert.equal(entries.get('with.newlines'), 'Pierwsza linia\nDruga linia\nTrzecia linia');
  });
});

// ─── parsePo — msgctxt ──────────────────────────────────

describe('parsePo — msgctxt', () => {
  it('parses entries with context using \\x04 separator', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('menu\x04Open'), 'Open');
    assert.equal(entries.get('button\x04Open'), 'Open file');
  });

  it('keeps context-less entries without separator', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('simple.key'), 'Simple value');
    // "simple.key" should NOT have \x04
    assert.equal(entries.has('\x04simple.key'), false);
  });

  it('parses Polish msgctxt entries', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'pl-PL.po'));
    assert.equal(entries.get('menu\x04Open'), 'Otwórz');
    assert.equal(entries.get('button\x04Open'), 'Otwórz plik');
  });
});

// ─── writePo ─────────────────────────────────────────────

describe('writePo', () => {
  it('writes simple entries correctly', () => {
    const outPath = path.join(TMP, 'simple.po');
    const entries = new Map([
      ['hello', 'world'],
      ['foo', 'bar'],
    ]);
    writePo(outPath, { language: 'en-US', pluralForms: 'nplurals=2; plural=(n != 1)' }, entries);

    const content = fs.readFileSync(outPath, 'utf-8');
    assert.ok(content.includes('msgid "hello"'));
    assert.ok(content.includes('msgstr "world"'));
  });

  it('writes multi-line strings', () => {
    const outPath = path.join(TMP, 'multiline.po');
    const entries = new Map([
      ['key', 'line1\nline2\nline3'],
    ]);
    writePo(outPath, { language: 'en-US', pluralForms: '' }, entries);

    const content = fs.readFileSync(outPath, 'utf-8');
    assert.ok(content.includes('msgstr ""'));
    assert.ok(content.includes('"line1\\n"'));
    assert.ok(content.includes('"line2\\n"'));
    assert.ok(content.includes('"line3"'));
  });

  it('writes msgctxt entries', () => {
    const outPath = path.join(TMP, 'context.po');
    const entries = new Map([
      ['menu\x04Open', 'Open menu'],
      ['button\x04Open', 'Open file'],
    ]);
    writePo(outPath, { language: 'en-US', pluralForms: '' }, entries);

    const content = fs.readFileSync(outPath, 'utf-8');
    assert.ok(content.includes('msgctxt "menu"'));
    assert.ok(content.includes('msgctxt "button"'));
    assert.ok(content.includes('msgid "Open"'));
    // Both should exist
    assert.ok(content.includes('msgstr "Open menu"'));
    assert.ok(content.includes('msgstr "Open file"'));
  });
});

// ─── Round-trip ──────────────────────────────────────────

describe('round-trip: parse → write → parse', () => {
  it('preserves entries through round-trip (en-US)', () => {
    const original = parsePo(path.join(FIXTURES, 'en-US.po'));
    const originalMeta = extractMeta(original.header);

    const outPath = path.join(TMP, 'roundtrip-en.po');
    writePo(outPath, {
      language: originalMeta.language,
      pluralForms: originalMeta.pluralForms,
    }, original.entries);

    const reparsed = parsePo(outPath);

    // Same number of entries
    assert.equal(reparsed.entries.size, original.entries.size);

    // Same key-value pairs
    for (const [key, value] of original.entries) {
      assert.equal(reparsed.entries.get(key), value,
        `Mismatch for key: ${key.replace('\x04', '::')}`);
    }
  });

  it('preserves entries through round-trip (pl-PL)', () => {
    const original = parsePo(path.join(FIXTURES, 'pl-PL.po'));
    const originalMeta = extractMeta(original.header);

    const outPath = path.join(TMP, 'roundtrip-pl.po');
    writePo(outPath, {
      language: originalMeta.language,
      pluralForms: originalMeta.pluralForms,
    }, original.entries);

    const reparsed = parsePo(outPath);

    assert.equal(reparsed.entries.size, original.entries.size);

    for (const [key, value] of original.entries) {
      assert.equal(reparsed.entries.get(key), value,
        `Mismatch for key: ${key.replace('\x04', '::')}`);
    }
  });

  it('preserves header metadata through round-trip', () => {
    const original = parsePo(path.join(FIXTURES, 'pl-PL.po'));
    const originalMeta = extractMeta(original.header);

    const outPath = path.join(TMP, 'roundtrip-meta.po');
    writePo(outPath, {
      language: originalMeta.language,
      pluralForms: originalMeta.pluralForms,
    }, original.entries);

    const reparsed = parsePo(outPath);
    const reparsedMeta = extractMeta(reparsed.header);

    assert.equal(reparsedMeta.language, originalMeta.language);
    assert.equal(reparsedMeta.pluralForms, originalMeta.pluralForms);
  });
});

// ─── Edge cases ──────────────────────────────────────────

describe('edge cases', () => {
  it('handles .po file with only header (no entries)', () => {
    const outPath = path.join(TMP, 'header-only.po');
    writePo(outPath, { language: 'en-US', pluralForms: 'nplurals=2; plural=(n != 1)' }, new Map());

    const { entries, header } = parsePo(outPath);
    assert.equal(entries.size, 0);
    assert.ok(header.length > 0);
  });

  it('handles strings with all escapable characters', () => {
    const outPath = path.join(TMP, 'escapes.po');
    const value = 'tab:\there\nnewline\n"quoted"\nback\\slash';
    const entries = new Map([['esc.test', value]]);
    writePo(outPath, { language: 'en-US', pluralForms: '' }, entries);

    const reparsed = parsePo(outPath);
    assert.equal(reparsed.entries.get('esc.test'), value);
  });

  it('handles msgid that is a long single word', () => {
    const outPath = path.join(TMP, 'longword.po');
    const longKey = 'a'.repeat(200);
    const entries = new Map([[longKey, 'value']]);
    writePo(outPath, { language: 'en-US', pluralForms: '' }, entries);

    const reparsed = parsePo(outPath);
    assert.equal(reparsed.entries.get(longKey), 'value');
  });
});
