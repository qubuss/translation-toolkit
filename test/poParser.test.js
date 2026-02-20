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

  it('keeps very long strings on single line (no newlines)', () => {
    const long = 'a'.repeat(200);
    const result = formatPoString('msgid', long);
    // No embedded newlines → stays single-line regardless of length
    assert.equal(result.length, 1);
    assert.equal(result[0], 'msgid "' + long + '"');
  });

  it('wraps long strings when explicit maxLen is provided', () => {
    const long = 'a'.repeat(200);
    const result = formatPoString('msgid', long, 76);
    // With explicit maxLen, should wrap
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
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('simple.key'), 'Simple value');
    assert.equal(entries.get('another.key'), 'Another value');
  });

  it('parses header metadata', () => {
    const { header } = parsePo(path.join(FIXTURES, 'en-US.po'));
    const meta = extractMeta(header);
    assert.equal(meta.language, 'en-US');
    assert.ok(meta.pluralForms.includes('nplurals=2'));
  });

  it('parses extended header fields', () => {
    const { header } = parsePo(path.join(FIXTURES, 'en-US.po'));
    const joined = header.join('\n');
    assert.ok(joined.includes('Content-Type: text/plain; charset=UTF-8'));
    assert.ok(joined.includes('MIME-Version: 1.0'));
  });

  it('parses empty msgstr', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('empty.value'), '');
  });

  it('parses whitespace-only values', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('whitespace.only'), '   ');
  });

  it('parses special characters (quotes and backslash)', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('special.chars'), 'Quotes: "hello" and backslash: \\ done');
  });

  it('parses numeric values', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('numeric.value'), '12345');
  });

  it('parses single character values', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('single.char'), 'X');
    assert.equal(entries.get('single.space'), ' ');
  });

  it('counts correct number of entries', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.size, 50);
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

  it('parses leading newlines', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('leading.newline'), '\nText after leading newline');
  });

  it('parses trailing newlines', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('trailing.newline'), 'Text before trailing newline\n');
  });

  it('parses multiple consecutive newlines', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('multiple.newlines'), 'Line one\n\n\nLine four after two blanks');
  });

  it('parses value that is only a newline', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('only.newline'), '\n');
  });

  it('parses Polish multi-line translations', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'pl-PL.po'));
    assert.equal(entries.get('with.newlines'), 'Pierwsza linia\nDruga linia\nTrzecia linia');
  });

  it('parses multi-line HTML content', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('html.multiline'),
      '<div class="container">\n  <p>Paragraph one</p>\n  <p>Paragraph two</p>\n</div>');
  });
});

// ─── parsePo — msgctxt ──────────────────────────────────

describe('parsePo — msgctxt', () => {
  it('parses entries with context using \\x04 separator', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('menu\x04Open'), 'Open');
    assert.equal(entries.get('button\x04Open'), 'Open file');
  });

  it('supports multiple contexts for the same msgid', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('menu\x04Open'), 'Open');
    assert.equal(entries.get('button\x04Open'), 'Open file');
    assert.equal(entries.get('dialog.title\x04Open'), 'Open Document');
  });

  it('keeps context-less entries without separator', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('simple.key'), 'Simple value');
    assert.equal(entries.has('\x04simple.key'), false);
  });

  it('parses context with same key as plain entry', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    // "simple.key" exists both plain and with "navigation" context
    assert.equal(entries.get('simple.key'), 'Simple value');
    assert.equal(entries.get('navigation\x04simple.key'), 'Simple key in navigation context');
  });

  it('parses multi-line msgctxt', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('long.context.that.wraps\x04multiline.ctx'), 'Entry with multiline msgctxt');
  });

  it('parses Polish msgctxt entries', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'pl-PL.po'));
    assert.equal(entries.get('menu\x04Open'), 'Otwórz');
    assert.equal(entries.get('button\x04Open'), 'Otwórz plik');
    assert.equal(entries.get('dialog.title\x04Open'), 'Otwórz dokument');
  });
});

// ─── parsePo — escaping edge cases ──────────────────────

describe('parsePo — escaping edge cases', () => {
  it('parses tabs in strings', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('tabs.in.string'), 'Col1\tCol2\tCol3');
  });

  it('parses mixed escape sequences', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    // "Line1\\nNot-a-newline" → literal backslash + n (not a newline)
    // "then real:\n" → actual newline
    assert.equal(entries.get('mixed.escapes'), 'Line1\\nNot-a-newline then real:\nnew line here\ttab');
  });

  it('parses nested quotes', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('nested.quotes'), 'She said: "He said: \\"hello\\""');
  });

  it('parses Windows-style paths with backslashes', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('backslash.newline'), 'C:\\Users\\john\\Documents\\file.txt');
  });

  it('parses URLs intact', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('url.value'), 'https://example.com/path?key=value&other=123#anchor');
  });
});

// ─── parsePo — Unicode ─────────────────────────────────

describe('parsePo — Unicode', () => {
  it('parses Polish/accented characters', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('unicode.accents'), 'Ąćęłńóśźż ĄĆĘŁŃÓŚŹŻ àáâãäå');
  });

  it('parses emoji', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('unicode.emoji'), 'Hello 🌍🚀✨ World 👋');
  });

  it('parses CJK characters', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('unicode.cjk'), '日本語テスト 中文测试 한국어');
  });

  it('parses RTL text', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('unicode.rtl'), 'مرحبا بالعالم');
  });

  it('parses math symbols', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('unicode.math'), '∑∏∫√∞≈≠≤≥');
  });
});

// ─── parsePo — HTML and format strings ──────────────────

describe('parsePo — HTML and format strings', () => {
  it('parses HTML tags in values', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('html.tags'), '<strong>Bold</strong> and <a href="https://example.com">link</a>');
  });

  it('parses HTML entities', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('html.entities'), '5 &gt; 3 &amp; 2 &lt; 4');
  });

  it('parses printf-style format strings', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('format.printf'), 'Hello %s, you have %d messages');
  });

  it('parses Python brace format strings', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('format.python.brace'), 'Hello {name}, you have {count} messages');
  });

  it('parses ICU message format', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('format.icu'), '{count, plural, one {# item} other {# items}}');
  });

  it('parses template literal placeholders', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('format.template'), 'Welcome {{username}}, your balance is ${{amount}}');
  });
});

// ─── parsePo — CSV-tricky values ────────────────────────

describe('parsePo — CSV delimiter edge cases', () => {
  it('parses values containing pipe character', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('pipe.delimiter'), 'Value with | pipe character');
    assert.equal(entries.get('many.pipes'), 'a|b|c|d|e');
  });

  it('parses values with quotes, pipes and newlines combined', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('csv.tricky'), 'Contains "quotes" and |pipes| and\nnewlines');
  });

  it('parses values with semicolons and commas', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('semicolons'), 'key1=val1; key2=val2; key3=val3');
    assert.equal(entries.get('commas.everywhere'), 'one, two, three, four');
  });
});

// ─── parsePo — comments are skipped ─────────────────────

describe('parsePo — comments handling', () => {
  it('skips all comment types and parses the entry', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    // Entry with all comment types should still be parsed
    assert.equal(entries.get('commented.entry'), 'This entry has all comment types');
    assert.equal(entries.get('translator.comment.only'), 'Has translator comment');
    assert.equal(entries.get('extracted.comment'), 'Has extracted comment');
    assert.equal(entries.get('reference.comment'), 'Has file reference');
  });

  it('skips fuzzy flags and parses the entry', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('fuzzy.entry'), 'This translation needs review: %s');
  });

  it('skips previous msgid comments and parses current entry', () => {
    const { entries } = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(entries.get('new.key.name'), 'Value from old key');
    assert.equal(entries.get('updated.source'), 'Updated translation');
    // Old keys should NOT appear as entries
    assert.equal(entries.has('old.key.name'), false);
    assert.equal(entries.has('previous.source'), false);
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

  it('long single-line strings stay single-line after write', () => {
    const outPath = path.join(TMP, 'long-singleline.po');
    const longValue = 'A'.repeat(200);
    const entries = new Map([['long.key', longValue]]);
    writePo(outPath, { language: 'en-US', pluralForms: '' }, entries);

    const content = fs.readFileSync(outPath, 'utf-8');
    // Should NOT have msgstr "" followed by continuation — should be single-line
    assert.ok(content.includes(`msgstr "${longValue}"`), 'Long single-line value should remain on one line');
    assert.ok(!content.includes('msgstr ""\n"AAAA'), 'Should not wrap into multi-line');
  });

  it('round-trips all 50 entries through write → parse (en-US)', () => {
    const original = parsePo(path.join(FIXTURES, 'en-US.po'));
    assert.equal(original.entries.size, 50, 'Fixture should have 50 entries');

    const outPath = path.join(TMP, 'full-roundtrip-en.po');
    const meta = extractMeta(original.header);
    writePo(outPath, { language: meta.language, pluralForms: meta.pluralForms }, original.entries);

    const reparsed = parsePo(outPath);
    assert.equal(reparsed.entries.size, 50, 'Round-tripped file should have 50 entries');

    for (const [key, value] of original.entries) {
      const dk = key.replace('\x04', '::');
      assert.equal(reparsed.entries.get(key), value, `Round-trip mismatch for: ${dk}`);
    }
  });

  it('round-trips all 50 entries through write → parse (pl-PL)', () => {
    const original = parsePo(path.join(FIXTURES, 'pl-PL.po'));
    assert.equal(original.entries.size, 50, 'Fixture should have 50 entries');

    const outPath = path.join(TMP, 'full-roundtrip-pl.po');
    const meta = extractMeta(original.header);
    writePo(outPath, { language: meta.language, pluralForms: meta.pluralForms }, original.entries);

    const reparsed = parsePo(outPath);
    assert.equal(reparsed.entries.size, 50, 'Round-tripped file should have 50 entries');

    for (const [key, value] of original.entries) {
      const dk = key.replace('\x04', '::');
      assert.equal(reparsed.entries.get(key), value, `Round-trip mismatch for: ${dk}`);
    }
  });
});
