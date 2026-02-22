/**
 * Utilities for parsing and writing .po translation files.
 *
 * Supports simple msgid/msgstr pairs (no plural forms).
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * Parse a .po file into an object { header: string, entries: Map<string, string> }.
 * Supports multi-line continuation strings and msgctxt.
 *
 * - header: the raw header block (metadata like Language, Plural-Forms)
 * - entries: Map of msgid → msgstr  (for entries with msgctxt, key = "ctx\x04msgid")
 *
 * @param {string} filePath - absolute path to .po file
 * @returns {{ header: string[], entries: Map<string, string> }}
 */
function parsePo(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const entries = new Map();
  const headerLines = [];

  // State machine: which field are we currently accumulating?
  // 'msgctxt' | 'msgid' | 'msgstr' | null
  let state = null;
  let currentMsgCtx = undefined;
  let currentMsgId = undefined;
  let currentMsgStr = undefined;
  let isHeader = false;

  function flushEntry() {
    if (currentMsgId === '' && isHeader) {
      // Header block — msgstr contains metadata lines
      if (currentMsgStr !== undefined) {
        // Split on literal \n boundaries already unescaped to newlines
        const parts = currentMsgStr.split('\n').filter((s) => s.length > 0);
        headerLines.push(...parts);
      }
    } else if (currentMsgId !== undefined && currentMsgStr !== undefined) {
      const key = currentMsgCtx !== undefined
        ? currentMsgCtx + '\x04' + currentMsgId
        : currentMsgId;
      entries.set(key, currentMsgStr);
    }
    currentMsgCtx = undefined;
    currentMsgId = undefined;
    currentMsgStr = undefined;
    isHeader = false;
    state = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip comments
    if (line.startsWith('#')) {
      continue;
    }

    // Blank line — flush current entry
    if (line.trim() === '') {
      flushEntry();
      continue;
    }

    // msgctxt
    if (line.startsWith('msgctxt ')) {
      // If we were building a previous entry, flush it
      if (state === 'msgstr') {
        flushEntry();
      }
      currentMsgCtx = extractQuoted(line, 'msgctxt ');
      state = 'msgctxt';
      continue;
    }

    // msgid
    if (line.startsWith('msgid ')) {
      // If previous entry is complete (has msgstr), flush it
      if (state === 'msgstr') {
        flushEntry();
      }
      currentMsgId = extractQuoted(line, 'msgid ');
      if (currentMsgId === '' && currentMsgCtx === undefined) {
        isHeader = true;
      }
      state = 'msgid';
      continue;
    }

    // msgstr
    if (line.startsWith('msgstr ')) {
      currentMsgStr = extractQuoted(line, 'msgstr ');
      state = 'msgstr';
      continue;
    }

    // Continuation line: starts with "
    if (line.startsWith('"')) {
      const continued = extractQuoted(line, '');
      if (state === 'msgctxt' && currentMsgCtx !== undefined) {
        currentMsgCtx += continued;
      } else if (state === 'msgid' && currentMsgId !== undefined) {
        currentMsgId += continued;
      } else if (state === 'msgstr' && currentMsgStr !== undefined) {
        currentMsgStr += continued;
      }
      continue;
    }
  }

  // Flush last entry
  flushEntry();

  return { header: headerLines, entries };
}

/**
 * Extract the string content between quotes from a .po line.
 * e.g. 'msgid "hello world"' with prefix 'msgid ' → 'hello world'
 *
 * @param {string} line
 * @param {string} prefix
 * @returns {string}
 */
function extractQuoted(line, prefix) {
  const withoutPrefix = line.slice(prefix.length).trim();
  // Remove surrounding quotes
  if (withoutPrefix.startsWith('"') && withoutPrefix.endsWith('"')) {
    return unescapePo(withoutPrefix.slice(1, -1));
  }
  return withoutPrefix;
}

/**
 * Unescape .po escape sequences (single-pass to handle \\n, \\t correctly).
 * @param {string} str
 * @returns {string}
 */
function unescapePo(str) {
  return str.replace(/\\([nt"\\])/g, (_, ch) => {
    switch (ch) {
      case 'n': return '\n';
      case 't': return '\t';
      case '"': return '"';
      case '\\': return '\\';
      default: return ch;
    }
  });
}

/**
 * Escape a string for use inside .po msgstr quotes.
 * @param {string} str
 * @returns {string}
 */
function escapePo(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}

/**
 * Wrap a string into multi-line .po format if it exceeds maxLen or contains newlines.
 * Returns an array of .po lines (without the keyword prefix on continuation lines).
 *
 * Short strings:  msgid "hello"
 * Long/multiline: msgid ""
 *                 "first part\n"
 *                 "second part"
 *
 * @param {string} keyword - 'msgid', 'msgstr', or 'msgctxt'
 * @param {string} value - raw string value
 * @param {number} [maxLen=Infinity] - soft line-length limit for wrapping (default: no length-based wrapping)
 * @returns {string[]}
 */
function formatPoString(keyword, value, maxLen = Infinity) {
  const escaped = escapePo(value);

  // If short enough and no embedded newlines, single line
  if (escaped.length <= maxLen - keyword.length - 3 && !escaped.includes('\\n')) {
    return [`${keyword} "${escaped}"`];
  }

  // Multi-line format: split on \n boundaries first
  const result = [`${keyword} ""`];
  const segments = escaped.split('\\n');

  for (let i = 0; i < segments.length; i++) {
    const isLast = i === segments.length - 1;
    let chunk = segments[i];
    // Re-attach \n except for the very last segment (if it's empty = trailing newline)
    if (!isLast) {
      chunk += '\\n';
    }
    if (chunk.length === 0) {
      continue; // skip empty trailing segment
    }
    result.push(`"${chunk}"`);
  }

  return result;
}

/**
 * Write a .po file from header metadata and entries.
 * Entries with \x04 in the key are treated as msgctxt entries (ctx\x04msgid).
 * Long strings are automatically wrapped in multi-line format.
 *
 * @param {string} filePath - absolute path to write to
 * @param {{ language: string, pluralForms: string }} meta - language metadata
 * @param {Map<string, string>} entries - msgid → msgstr map (or ctx\x04msgid → msgstr)
 */
function writePo(filePath, meta, entries) {
  const lines = [];

  // Header
  lines.push('msgid ""');
  lines.push('msgstr ""');
  if (meta.pluralForms) {
    lines.push(`"Plural-Forms: ${meta.pluralForms}\\n"`);
  }
  lines.push(`"Language: ${meta.language}\\n"`);
  lines.push('');

  // Entries
  for (const [compositeKey, msgstr] of entries) {
    // Check if this is a msgctxt entry
    const sepIdx = compositeKey.indexOf('\x04');
    if (sepIdx !== -1) {
      const ctx = compositeKey.slice(0, sepIdx);
      const msgid = compositeKey.slice(sepIdx + 1);
      lines.push(...formatPoString('msgctxt', ctx));
      lines.push(...formatPoString('msgid', msgid));
    } else {
      lines.push(...formatPoString('msgid', compositeKey));
    }
    lines.push(...formatPoString('msgstr', msgstr));
    lines.push('');
  }

  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
}

/**
 * Read a complete .po entry block starting at line index i.
 * An entry = optional msgctxt + msgid + msgstr (each with optional continuation lines).
 * Returns null if the line doesn't start an entry.
 *
 * @param {string[]} lines
 * @param {number} startIdx
 * @returns {{ compositeKey: string, isHeader: boolean, msgstrStart: number, msgstrEnd: number, endIdx: number } | null}
 */
function _readEntryBlock(lines, startIdx) {
  let i = startIdx;
  let currentMsgCtx;
  let currentMsgId;

  // Optional msgctxt
  if (lines[i] && lines[i].startsWith('msgctxt ')) {
    currentMsgCtx = extractQuoted(lines[i], 'msgctxt ');
    i++;
    while (i < lines.length && lines[i].startsWith('"')) {
      currentMsgCtx += extractQuoted(lines[i], '');
      i++;
    }
  }

  // msgid (required)
  if (!lines[i] || !lines[i].startsWith('msgid ')) {
    return null;
  }
  currentMsgId = extractQuoted(lines[i], 'msgid ');
  i++;
  while (i < lines.length && lines[i].startsWith('"')) {
    currentMsgId += extractQuoted(lines[i], '');
    i++;
  }

  // msgstr (required)
  if (!lines[i] || !lines[i].startsWith('msgstr ')) {
    return null;
  }
  const msgstrStart = i;
  i++;
  while (i < lines.length && lines[i].startsWith('"')) {
    i++;
  }
  const msgstrEnd = i;

  const isHeader = (currentMsgId === '' && currentMsgCtx === undefined);
  const compositeKey = currentMsgCtx !== undefined
    ? currentMsgCtx + '\x04' + currentMsgId
    : currentMsgId;

  return { compositeKey, isHeader, msgstrStart, msgstrEnd, endIdx: i };
}

/**
 * Extract the unescaped msgstr value from raw .po lines spanning msgstrStart..msgstrEnd.
 *
 * @param {string[]} lines
 * @param {number} start
 * @param {number} end
 * @returns {string}
 */
function _extractValueFromLines(lines, start, end) {
  let value = extractQuoted(lines[start], 'msgstr ');
  for (let j = start + 1; j < end; j++) {
    value += extractQuoted(lines[j], '');
  }
  return value;
}

/**
 * Patch an existing .po file in-place: update/add entries without disturbing
 * the original formatting (header, comments, blank lines).
 *
 * Unlike writePo (which regenerates the file from scratch), patchPoFile reads
 * the original file, locates each entry, and only replaces the msgstr lines
 * that actually changed.  Everything else is preserved byte-for-byte.
 *
 * @param {string} filePath
 * @param {Map<string, string>} newEntries - entries from CSV (key → value)
 * @param {boolean} removeAbsent - if true, drop entries not in newEntries (replace mode)
 */
function patchPoFile(filePath, newEntries, removeAbsent = false) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const output = [];
  const seenKeys = new Set();
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank or comment line — preserve as-is
    if (line.trim() === '' || line.startsWith('#')) {
      output.push(line);
      i++;
      continue;
    }

    // Try to read a complete entry block
    const entry = _readEntryBlock(lines, i);
    if (!entry) {
      // Unrecognized line (e.g. msgid_plural, msgstr[N]) — preserve
      output.push(line);
      i++;
      continue;
    }

    const { compositeKey, isHeader, msgstrStart, msgstrEnd, endIdx } = entry;

    if (isHeader) {
      // Preserve header block exactly as-is
      for (let j = i; j < endIdx; j++) output.push(lines[j]);
    } else if (newEntries.has(compositeKey)) {
      seenKeys.add(compositeKey);
      const newValue = newEntries.get(compositeKey);
      const oldValue = _extractValueFromLines(lines, msgstrStart, msgstrEnd);

      // Copy msgctxt + msgid lines as-is
      for (let j = i; j < msgstrStart; j++) output.push(lines[j]);

      if (newValue === oldValue) {
        // Unchanged — preserve original msgstr lines verbatim
        for (let j = msgstrStart; j < msgstrEnd; j++) output.push(lines[j]);
      } else {
        // Changed — write new msgstr, matching original single/multi-line style
        const wasSingleLine = (msgstrEnd - msgstrStart === 1);
        if (wasSingleLine && !newValue.includes('\n')) {
          output.push(`msgstr "${escapePo(newValue)}"`);
        } else {
          output.push(...formatPoString('msgstr', newValue));
        }
      }
    } else if (!removeAbsent) {
      // Merge mode: keep original entries not in CSV
      for (let j = i; j < endIdx; j++) output.push(lines[j]);
    }
    // else: replace mode + key not in CSV → omit (removed)

    i = endIdx;
  }

  // Append new entries not found in original file
  for (const [key, value] of newEntries) {
    if (!seenKeys.has(key)) {
      output.push('');
      const sepIdx = key.indexOf('\x04');
      if (sepIdx !== -1) {
        output.push(...formatPoString('msgctxt', key.slice(0, sepIdx)));
        output.push(...formatPoString('msgid', key.slice(sepIdx + 1)));
      } else {
        output.push(...formatPoString('msgid', key));
      }
      output.push(...formatPoString('msgstr', value));
    }
  }

  fs.writeFileSync(filePath, output.join('\n'), 'utf-8');
}

/**
 * Discover all .po files in the translations directory.
 * Returns array of { filePath, locale, shortCode }.
 * e.g. { filePath: '.../en-US.po', locale: 'en-US', shortCode: 'en' }
 *
 * @param {string} translationsDir
 * @returns {Array<{ filePath: string, locale: string, shortCode: string }>}
 */
function discoverPoFiles(translationsDir) {
  const files = fs.readdirSync(translationsDir).filter((f) => f.endsWith('.po'));

  return files.map((file) => {
    const locale = file.replace('.po', '');
    const shortCode = locale.split('-')[0];
    return {
      filePath: path.join(translationsDir, file),
      locale,
      shortCode,
    };
  });
}

/**
 * Extract metadata (Language, Plural-Forms) from parsed header lines.
 *
 * @param {string[]} headerLines
 * @returns {{ language: string | undefined, pluralForms: string | undefined }}
 */
function extractMeta(headerLines) {
  const joined = headerLines.join('\n');
  let language;
  let pluralForms;

  const langMatch = joined.match(/Language:\s*([^\n\\]+)/);
  if (langMatch) {
    language = langMatch[1].trim();
  }

  const pluralMatch = joined.match(/Plural-Forms:\s*([^\n]+)/);
  if (pluralMatch) {
    pluralForms = pluralMatch[1].trim().replace(/\\n$/, '');
  }

  return { language, pluralForms };
}

/**
 * Ignored directories when searching for .po files.
 */
const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'build', '.next', '.nuxt',
  'coverage', '__pycache__', '.tox', 'venv', '.venv', 'vendor',
]);

/**
 * Recursively find all directories containing .po files.
 * Skips common non-project directories (node_modules, .git, etc.).
 *
 * @param {string} rootDir - directory to start searching from
 * @returns {string[]} - array of absolute directory paths containing .po files
 */
function findPoDirectories(rootDir) {
  const result = new Set();

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // skip unreadable dirs
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          walk(path.join(dir, entry.name));
        }
      } else if (entry.isFile() && entry.name.endsWith('.po')) {
        result.add(dir);
      }
    }
  }

  walk(rootDir);
  return [...result];
}

/**
 * Ask user to pick one of the directories interactively via stdin.
 *
 * @param {string[]} dirs - list of directories
 * @param {string} cwd - current working directory (for relative path display)
 * @returns {Promise<string>} - chosen directory (absolute path)
 */
function askUserToPickDir(dirs, cwd) {
  // In CI mode, auto-select the first directory (no interactive prompt)
  if (process.env.TT_CI) {
    const relative = path.relative(cwd, dirs[0]) || '.';
    console.log(`CI mode: multiple .po directories found, using first: ${relative}`);
    return Promise.resolve(dirs[0]);
  }

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('\nFound .po files in multiple directories:\n');
    dirs.forEach((dir, i) => {
      const relative = path.relative(cwd, dir) || '.';
      const count = fs.readdirSync(dir).filter((f) => f.endsWith('.po')).length;
      console.log(`  [${i + 1}] ${relative}  (${count} .po file${count !== 1 ? 's' : ''})`);
    });
    console.log('');

    rl.question('Pick a directory [1]: ', (answer) => {
      rl.close();
      const index = answer.trim() === '' ? 0 : parseInt(answer.trim(), 10) - 1;

      if (isNaN(index) || index < 0 || index >= dirs.length) {
        console.error('Invalid choice.');
        process.exit(1);
      }

      resolve(dirs[index]);
    });
  });
}

/**
 * Resolve the translations directory:
 * 1. If --dir was provided, use it.
 * 2. Otherwise, auto-discover .po files from cwd.
 *    - If one directory found → use it automatically.
 *    - If multiple → ask user to pick.
 *    - If none → error.
 *
 * @param {string | undefined} explicitDir - directory from --dir flag
 * @returns {Promise<string>} - absolute path to translations directory
 */
async function resolveTranslationsDir(explicitDir) {
  if (explicitDir) {
    const resolved = path.resolve(explicitDir);
    if (!fs.existsSync(resolved)) {
      console.error(`Directory not found: ${resolved}`);
      process.exit(1);
    }
    return resolved;
  }

  const cwd = process.cwd();
  console.log(`Searching for .po files in ${cwd} ...`);
  const dirs = findPoDirectories(cwd);

  if (dirs.length === 0) {
    console.error('No .po files found. Use --dir to specify the translations directory.');
    process.exit(1);
  }

  if (dirs.length === 1) {
    const relative = path.relative(cwd, dirs[0]) || '.';
    console.log(`Found .po files in: ${relative}`);
    return dirs[0];
  }

  return askUserToPickDir(dirs, cwd);
}

module.exports = {
  parsePo,
  writePo,
  patchPoFile,
  discoverPoFiles,
  extractMeta,
  escapePo,
  unescapePo,
  formatPoString,
  findPoDirectories,
  resolveTranslationsDir,
};
