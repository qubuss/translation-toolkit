/**
 * Preview translations in a local web browser.
 * Starts an HTTP server serving an interactive, searchable table
 * with a Validation tab that highlights translation issues.
 */

const fs = require('fs');
const http = require('http');
const { parsePo, writePo, extractMeta, discoverPoFiles, resolveTranslationsDir } = require('./poParser');
const { validateTranslations } = require('./validate');
const { computeStats } = require('./stats');
const { computeDiff, parseCsvFile, loadPoAsCsv } = require('./diff');

/**
 * Build the full HTML page with tabs: Translations + Validation + Statistics.
 *
 * @param {Array<{ key: string, translations: Record<string, string> }>} rows
 * @param {string[]} languages
 * @param {string} translationsDir
 * @param {{ issues: import('./validate').ValidationIssue[], refLang: string, totalKeys: number }} validationResult
 * @param {import('./stats').StatsResult} statsResult
 * @param {boolean} [staticMode=false] - If true, generate standalone HTML without server dependencies
 * @returns {string}
 */
function buildHtml(rows, languages, translationsDir, validationResult, statsResult, staticMode = false) {
  const dataJson = JSON.stringify(rows);
  const langsJson = JSON.stringify(languages);
  // Convert internal \x04 separator to :: for display in validation issues and stats
  const displayIssues = validationResult.issues.map((i) => ({
    ...i,
    key: i.key.replace('\x04', '::'),
  }));
  const displayStats = {
    ...statsResult,
    langStats: statsResult.langStats.map((ls) => ({
      ...ls,
      topMissing: ls.topMissing.map((k) => k.replace('\x04', '::')),
    })),
  };
  const issuesJson = JSON.stringify(displayIssues);
  const statsJson = JSON.stringify(displayStats);
  const errorCount = validationResult.issues.filter((i) => i.severity === 'error').length;
  const warnCount = validationResult.issues.filter((i) => i.severity === 'warning').length;
  const totalIssues = validationResult.issues.length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>translation-toolkit — Translation Preview</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }

    :root {
      --header-h: 54px;
      --tabs-h: 44px;
      --toolbar-h: 54px;
      --bg-primary: #f5f5f5;
      --bg-card: #fff;
      --bg-header-row: #f0f2f5;
      --bg-header-key: #e8eaf0;
      --bg-hover: #f7f8ff;
      --bg-even: #fafafa;
      --bg-even-hover: #f0f2ff;
      --text-primary: #1a1a1a;
      --text-secondary: #666;
      --text-muted: #999;
      --text-key: #6b4ce6;
      --border: #e0e0e0;
      --border-light: #eee;
      --input-border: #d0d0d0;
      --input-bg: #fff;
      --accent: #4a6cf7;
      --accent-hover: #3b5de7;
      --shadow: rgba(0,0,0,0.08);
    }

    body.dark {
      --bg-primary: #0f0f17;
      --bg-card: #1a1a2e;
      --bg-header-row: #16162a;
      --bg-header-key: #1e1e3a;
      --bg-hover: #22224a;
      --bg-even: #16162a;
      --bg-even-hover: #22224a;
      --text-primary: #e0e0e0;
      --text-secondary: #a0a0b0;
      --text-muted: #666;
      --text-key: #a78bfa;
      --border: #2a2a40;
      --border-light: #22223a;
      --input-border: #3a3a55;
      --input-bg: #1a1a2e;
      --accent: #6d8aff;
      --accent-hover: #5a73e8;
      --shadow: rgba(0,0,0,0.3);
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      margin: 0;
      padding: 0;
      background: var(--bg-primary);
      color: var(--text-primary);
      transition: background 0.3s, color 0.3s;
    }

    .header {
      background: #1a1a2e;
      color: #fff;
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    }

    .header h1 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }

    .header .meta {
      font-size: 13px;
      opacity: 0.7;
    }

    /* ── Tabs ─────────────────────────────── */

    .tabs-bar {
      background: var(--bg-card);
      border-bottom: 2px solid var(--border);
      display: flex;
      padding: 0 24px;
      position: sticky;
      top: var(--header-h);
      z-index: 100;
    }

    .tab-btn {
      padding: 10px 20px;
      font-size: 14px;
      font-weight: 500;
      border: none;
      background: none;
      cursor: pointer;
      color: var(--text-secondary);
      border-bottom: 2px solid transparent;
      margin-bottom: -2px;
      transition: color 0.15s, border-color 0.15s;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .tab-btn:hover {
      color: var(--text-primary);
    }

    .tab-btn.active {
      color: #4a6cf7;
      border-bottom-color: #4a6cf7;
    }

    .tab-badge {
      font-size: 11px;
      padding: 1px 7px;
      border-radius: 10px;
      font-weight: 600;
    }

    .tab-badge.error {
      background: #fee2e2;
      color: #dc2626;
    }

    .tab-badge.ok {
      background: #dcfce7;
      color: #16a34a;
    }

    .tab-panel {
      display: none;
    }

    .tab-panel.active {
      display: block;
    }

    /* ── Toolbar (translations) ──────────── */

    .toolbar {
      padding: 12px 24px;
      background: var(--bg-card);
      border-bottom: 1px solid var(--border);
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
      position: sticky;
      top: calc(var(--header-h) + var(--tabs-h));
      z-index: 99;
    }

    .toolbar input[type="text"] {
      padding: 8px 12px;
      border: 1px solid var(--input-border);
      border-radius: 6px;
      font-size: 14px;
      width: 320px;
      outline: none;
      transition: border-color 0.2s;
      background: var(--input-bg);
      color: var(--text-primary);
    }

    .toolbar input[type="text"]:focus {
      border-color: #4a6cf7;
      box-shadow: 0 0 0 2px rgba(74, 108, 247, 0.15);
    }

    .toolbar .stats {
      font-size: 13px;
      color: var(--text-secondary);
      margin-left: auto;
    }

    .toolbar select {
      padding: 8px 12px;
      border: 1px solid var(--input-border);
      border-radius: 6px;
      font-size: 14px;
      background: var(--input-bg);
      color: var(--text-primary);
      outline: none;
      cursor: pointer;
    }

    .table-wrapper {
      padding: 16px 24px 40px;
    }

    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      background: var(--bg-card);
      border-radius: 8px;
      box-shadow: 0 1px 4px var(--shadow);
      font-size: 14px;
    }

    thead th {
      background: var(--bg-header-row);
      padding: 10px 14px;
      text-align: left;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-secondary);
      border-bottom: 2px solid var(--border);
      position: sticky;
      top: calc(var(--header-h) + var(--tabs-h) + var(--toolbar-h));
      z-index: 50;
      white-space: nowrap;
    }

    thead th.col-key {
      min-width: 260px;
      background: var(--bg-header-key);
    }

    thead th.col-lang {
      min-width: 200px;
    }

    /* rounded corners on corner cells (no overflow:hidden on table so sticky works) */
    thead tr:first-child th:first-child { border-top-left-radius: 8px; }
    thead tr:first-child th:last-child  { border-top-right-radius: 8px; }
    tbody tr:last-child td:first-child  { border-bottom-left-radius: 8px; }
    tbody tr:last-child td:last-child   { border-bottom-right-radius: 8px; }

    tbody tr {
      transition: background 0.1s;
    }

    tbody tr:hover {
      background: var(--bg-hover);
    }

    tbody tr:nth-child(even) {
      background: var(--bg-even);
    }

    tbody tr:nth-child(even):hover {
      background: var(--bg-even-hover);
    }

    tbody td {
      padding: 8px 14px;
      border-bottom: 1px solid var(--border-light);
      vertical-align: top;
      line-height: 1.5;
    }

    tbody td.cell-key {
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 13px;
      color: var(--text-key);
      word-break: break-all;
    }

    tbody td.cell-value {
      color: var(--text-primary);
    }

    tbody td.cell-empty {
      color: var(--text-muted);
      font-style: italic;
    }

    tr.plural-row {
      background: color-mix(in srgb, var(--accent) 6%, transparent);
    }
    tr.plural-row td.cell-key .plural-badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 600;
      color: var(--accent);
      background: color-mix(in srgb, var(--accent) 12%, transparent);
      border-radius: 3px;
      padding: 1px 4px;
      margin-left: 6px;
      vertical-align: middle;
    }

    .highlight {
      background: #fff3bf;
      border-radius: 2px;
      padding: 0 1px;
    }

    .filter-missing {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      cursor: pointer;
      user-select: none;
    }

    .filter-missing input { cursor: pointer; }

    /* ── Validation tab styles ───────────── */

    .val-toolbar {
      padding: 12px 24px;
      background: var(--bg-card);
      border-bottom: 1px solid var(--border);
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
      position: sticky;
      top: 98px;
      z-index: 99;
    }

    .val-toolbar select,
    .val-toolbar input[type="text"] {
      padding: 8px 12px;
      border: 1px solid var(--input-border);
      border-radius: 6px;
      font-size: 14px;
      background: var(--input-bg);
      color: var(--text-primary);
      outline: none;
    }

    .val-toolbar input[type="text"] {
      width: 280px;
    }

    .val-toolbar input[type="text"]:focus {
      border-color: #4a6cf7;
      box-shadow: 0 0 0 2px rgba(74, 108, 247, 0.15);
    }

    .val-toolbar .stats {
      font-size: 13px;
      color: #666;
      margin-left: auto;
    }

    .val-summary {
      display: flex;
      gap: 16px;
      padding: 16px 24px 0;
    }

    .val-card {
      background: var(--bg-card);
      border-radius: 8px;
      padding: 16px 24px;
      box-shadow: 0 1px 4px var(--shadow);
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 140px;
    }

    .val-card .number {
      font-size: 32px;
      font-weight: 700;
    }

    .val-card .label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #666;
      margin-top: 4px;
    }

    .val-card.errors .number { color: #dc2626; }
    .val-card.warnings .number { color: #d97706; }
    .val-card.ok .number { color: #16a34a; }

    .val-issue-row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 10px 14px;
      border-bottom: 1px solid var(--border-light);
    }

    .val-issue-row:hover {
      background: var(--bg-hover);
    }

    .val-icon {
      flex-shrink: 0;
      width: 20px;
      text-align: center;
      font-size: 14px;
      padding-top: 1px;
    }

    .val-icon.error { color: #dc2626; }
    .val-icon.warning { color: #d97706; }

    .val-issue-body {
      flex: 1;
      min-width: 0;
    }

    .val-issue-key {
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 13px;
      color: var(--text-key);
      word-break: break-all;
    }

    .val-issue-msg {
      font-size: 13px;
      color: var(--text-secondary);
      margin-top: 2px;
    }

    .val-issue-lang {
      flex-shrink: 0;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 4px;
      background: #f0f2f5;
      color: #555;
      text-transform: uppercase;
    }

    .val-type-badge {
      font-size: 11px;
      padding: 1px 6px;
      border-radius: 4px;
      margin-left: 6px;
    }

    .val-type-badge.missing-key { background: #fee2e2; color: #dc2626; }
    .val-type-badge.extra-key { background: #fef9c3; color: #a16207; }
    .val-type-badge.empty-translation { background: #fef3c7; color: #d97706; }
    .val-type-badge.variable-mismatch { background: #ede9fe; color: #7c3aed; }

    .val-empty-state {
      text-align: center;
      padding: 60px 24px;
      color: #16a34a;
      font-size: 18px;
    }

    .val-empty-state .icon {
      font-size: 48px;
      margin-bottom: 12px;
    }

    /* ── Statistics tab styles ────────────── */

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
      gap: 16px;
      padding: 16px 24px;
    }

    .stats-overview {
      display: flex;
      gap: 16px;
      padding: 16px 24px 0;
      flex-wrap: wrap;
    }

    .stats-overview .val-card {
      flex: 1;
      min-width: 120px;
    }

    .lang-card {
      background: var(--bg-card);
      border-radius: 10px;
      box-shadow: 0 1px 4px var(--shadow);
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .lang-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .lang-card-header .lang-name {
      font-size: 18px;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--text-primary);
    }

    .lang-card-header .lang-tag {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
      background: #e8eaf0;
      color: #555;
    }

    .lang-card-header .lang-tag.ref {
      background: #dbeafe;
      color: #2563eb;
    }

    .coverage-bar-container {
      width: 100%;
      height: 24px;
      background: var(--bg-header-row);
      border-radius: 12px;
      overflow: hidden;
      position: relative;
    }

    .coverage-bar-fill {
      height: 100%;
      border-radius: 12px;
      transition: width 0.6s ease;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 8px;
      font-size: 11px;
      font-weight: 700;
      color: #fff;
      min-width: 40px;
    }

    .coverage-bar-fill.high { background: linear-gradient(90deg, #22c55e, #16a34a); }
    .coverage-bar-fill.mid { background: linear-gradient(90deg, #eab308, #d97706); }
    .coverage-bar-fill.low { background: linear-gradient(90deg, #ef4444, #dc2626); }

    .lang-card-stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .lang-stat-item {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      padding: 4px 0;
      border-bottom: 1px solid var(--border-light);
    }

    .lang-stat-item .stat-label { color: var(--text-secondary); }
    .lang-stat-item .stat-value { font-weight: 600; color: var(--text-primary); }
    .lang-stat-item .stat-value.warn { color: #d97706; }
    .lang-stat-item .stat-value.bad { color: #dc2626; }

    .lang-card-missing {
      margin-top: 4px;
    }

    .lang-card-missing summary {
      font-size: 12px;
      color: #666;
      cursor: pointer;
      user-select: none;
    }

    .lang-card-missing .missing-list {
      margin-top: 6px;
      padding-left: 0;
      list-style: none;
      max-height: 120px;
      overflow-y: auto;
    }

    .lang-card-missing .missing-list li {
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 12px;
      color: var(--text-key);
      padding: 2px 0;
    }

    /* ── Editable cells ───────────────── */

    tbody td.cell-value,
    tbody td.cell-empty {
      cursor: pointer;
      position: relative;
    }

    tbody td.cell-value:hover,
    tbody td.cell-empty:hover {
      outline: 2px solid #4a6cf7;
      outline-offset: -2px;
      border-radius: 3px;
    }

    tbody td.editing {
      padding: 0;
      outline: 2px solid #4a6cf7;
      outline-offset: -2px;
      border-radius: 3px;
    }

    tbody td.editing textarea {
      width: 100%;
      min-height: 60px;
      border: none;
      padding: 8px 14px;
      font-family: inherit;
      font-size: 14px;
      line-height: 1.5;
      resize: vertical;
      outline: none;
      background: #fffde7;
    }

    .save-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: #1a1a2e;
      color: #fff;
      padding: 10px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      z-index: 200;
      box-shadow: 0 -2px 8px rgba(0,0,0,0.2);
      transform: translateY(100%);
      transition: transform 0.25s ease;
    }

    .save-bar.visible {
      transform: translateY(0);
    }

    .save-bar .changes-count {
      font-size: 14px;
    }

    .save-bar .save-actions {
      display: flex;
      gap: 10px;
    }

    .save-bar button {
      padding: 8px 20px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }

    .save-bar .btn-save {
      background: #4a6cf7;
      color: #fff;
    }

    .save-bar .btn-save:hover {
      background: #3b5de7;
    }

    .save-bar .btn-save:disabled {
      background: #666;
      cursor: not-allowed;
    }

    .save-bar .btn-discard {
      background: transparent;
      color: #aaa;
      border: 1px solid #555;
    }

    .save-bar .btn-discard:hover {
      color: #fff;
      border-color: #999;
    }

    .cell-flash {
      animation: flashGreen 0.6s ease;
    }

    @keyframes flashGreen {
      0% { background: #dcfce7; }
      100% { background: transparent; }
    }

    /* ── Diff tab styles ───────────────── */

    .diff-upload-zone {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      align-items: center;
    }

    .diff-mode-toggle {
      display: flex;
      gap: 0;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #d0d0d0;
    }

    .diff-mode-btn {
      padding: 10px 20px;
      font-size: 13px;
      font-weight: 500;
      border: none;
      background: var(--bg-card);
      cursor: pointer;
      color: var(--text-secondary);
      transition: all 0.15s;
    }

    .diff-mode-btn.active {
      background: #4a6cf7;
      color: #fff;
    }

    .diff-file-inputs {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      justify-content: center;
    }

    .diff-file-box {
      border: 2px dashed var(--input-border);
      border-radius: 8px;
      padding: 24px 32px;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.2s, background 0.2s;
      min-width: 200px;
      position: relative;
    }

    .diff-file-box:hover {
      border-color: var(--accent);
      background: var(--bg-hover);
    }

    .diff-file-box.has-file {
      border-color: #16a34a;
      background: #f0fdf4;
    }

    .diff-file-box .file-label {
      font-size: 13px;
      color: var(--text-secondary);
      margin-bottom: 8px;
    }

    .diff-file-box .file-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .diff-file-box input[type="file"] {
      position: absolute;
      inset: 0;
      opacity: 0;
      cursor: pointer;
    }

    .diff-run-btn {
      padding: 10px 28px;
      background: #4a6cf7;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }

    .diff-run-btn:hover { background: #3b5de7; }
    .diff-run-btn:disabled { background: #999; cursor: not-allowed; }

    .diff-results {
      padding: 0 24px 24px;
    }

    .diff-summary {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }

    .diff-entry {
      padding: 10px 14px;
      border-bottom: 1px solid var(--border-light);
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }

    .diff-entry:hover { background: var(--bg-hover); }

    .diff-badge {
      flex-shrink: 0;
      font-size: 12px;
      font-weight: 700;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .diff-badge.added { background: #dcfce7; color: #16a34a; }
    .diff-badge.removed { background: #fee2e2; color: #dc2626; }
    .diff-badge.changed { background: #fef9c3; color: #a16207; }

    .diff-entry-body { flex: 1; min-width: 0; }

    .diff-entry-key {
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 13px;
      color: var(--text-key);
      word-break: break-all;
    }

    .diff-entry-lang {
      font-size: 11px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 4px;
      background: #f0f2f5;
      color: #555;
      text-transform: uppercase;
      margin-left: 6px;
    }

    .diff-old, .diff-new {
      font-size: 13px;
      margin-top: 4px;
      padding: 2px 6px;
      border-radius: 3px;
    }

    .diff-old {
      background: #fee2e2;
      color: #991b1b;
      text-decoration: line-through;
    }

    .diff-new {
      background: #dcfce7;
      color: #166534;
    }

    @media (max-width: 768px) {
      .toolbar input[type="text"] { width: 100%; }
      .header { flex-direction: column; gap: 4px; align-items: flex-start; }
      .val-summary { flex-wrap: wrap; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>translation-toolkit</h1>
    <div style="display:flex;align-items:center;gap:16px">
      <div class="meta">${translationsDir}</div>
      <button id="darkToggle" title="Toggle dark mode" style="background:none;border:1px solid rgba(255,255,255,0.3);border-radius:6px;padding:6px 10px;cursor:pointer;font-size:16px;color:#fff;transition:border-color 0.2s">🌙</button>
    </div>
  </div>

  <!-- Tabs -->
  <div class="tabs-bar">
    <button class="tab-btn active" data-tab="translations">Translations</button>
    <button class="tab-btn" data-tab="validation">
      Validation
      <span class="tab-badge ${totalIssues === 0 ? 'ok' : 'error'}">${totalIssues === 0 ? '✓' : totalIssues}</span>
    </button>
    <button class="tab-btn" data-tab="statistics">
      Statistics
    </button>
    <button class="tab-btn" data-tab="diff">
      Diff
    </button>
  </div>

  <!-- ═══ Translations Tab ═══ -->
  <div class="tab-panel active" id="panel-translations">
    <div class="toolbar">
      <input type="text" id="search" placeholder="Search keys or translations..." autofocus />
      <select id="langFilter">
        <option value="">All languages</option>
      </select>
      <label class="filter-missing">
        <input type="checkbox" id="missingOnly" />
        Show missing only
      </label>
      <div class="stats" id="stats"></div>
    </div>
    <div class="table-wrapper">
      <table>
        <thead id="thead"></thead>
        <tbody id="tbody"></tbody>
      </table>
    </div>
  </div>

  <!-- ═══ Validation Tab ═══ -->
  <div class="tab-panel" id="panel-validation">
    <div class="val-toolbar">
      <input type="text" id="valSearch" placeholder="Search issues..." />
      <select id="valSeverity">
        <option value="">All severities</option>
        <option value="error">Errors only</option>
        <option value="warning">Warnings only</option>
      </select>
      <select id="valType">
        <option value="">All types</option>
        <option value="missing-key">Missing key</option>
        <option value="extra-key">Extra key</option>
        <option value="empty-translation">Empty translation</option>
        <option value="variable-mismatch">Variable mismatch</option>
      </select>
      <select id="valLang">
        <option value="">All languages</option>
      </select>
      <div class="stats" id="valStats"></div>
    </div>

    <div class="val-summary" id="valSummary"></div>

    <div class="table-wrapper" id="valContent"></div>
  </div>

  <!-- ═══ Statistics Tab ═══ -->
  <div class="tab-panel" id="panel-statistics">
    <div class="stats-overview" id="statsOverview"></div>
    <div class="stats-grid" id="statsGrid"></div>
  </div>

  <!-- ═══ Diff Tab ═══ -->
  <div class="tab-panel" id="panel-diff">
    <div class="diff-upload-zone" id="diffUploadZone">
      <div class="diff-mode-toggle">
        ${staticMode ? '' : '<button class="diff-mode-btn active" data-mode="csv-vs-po">CSV vs Current .po</button>'}
        <button class="diff-mode-btn ${staticMode ? 'active' : ''}" data-mode="csv-vs-csv">CSV vs CSV</button>
      </div>

      <div class="diff-file-inputs" id="diffFileInputs">
        <div class="diff-file-box" id="diffFileA">
          <div class="file-label">CSV file</div>
          <div class="file-name" id="diffFileAName">Click to select...</div>
          <input type="file" accept=".csv,.txt" id="diffInputA" />
        </div>
        <div class="diff-file-box" id="diffFileB" style="display:none">
          <div class="file-label">Second CSV</div>
          <div class="file-name" id="diffFileBName">Click to select...</div>
          <input type="file" accept=".csv,.txt" id="diffInputB" />
        </div>
      </div>

      <button class="diff-run-btn" id="diffRunBtn" disabled>Compare</button>
    </div>

    <div class="diff-results" id="diffResults" style="display:none">
      <div class="diff-summary" id="diffSummary"></div>
      <div id="diffContent" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08)"></div>
    </div>
  </div>

  <!-- ═══ Save Bar (fixed bottom) ═══ -->
  ${staticMode ? `<div class="save-bar" id="saveBar" style="display:none"></div>` : `<div class="save-bar" id="saveBar">
    <span class="changes-count" id="changesCount">0 unsaved changes</span>
    <div class="save-actions">
      <button class="btn-discard" id="btnDiscard">Discard</button>
      <button class="btn-save" id="btnSave">Save to .po files</button>
    </div>
  </div>`}

  ${staticMode ? `<div style="position:fixed;bottom:0;left:0;right:0;background:var(--bg-card);border-top:1px solid var(--border);padding:8px 24px;text-align:center;font-size:12px;color:var(--text-muted);z-index:100">
    Static preview generated by <strong>translation-toolkit</strong> on ${new Date().toISOString().slice(0, 10)} · Read-only mode
  </div>` : ''}

  <script>
    // ── Data ──
    const DATA = ${dataJson};
    const LANGUAGES = ${langsJson};
    const ISSUES = ${issuesJson};
    const STATS_DATA = ${statsJson};
    const REF_LANG = ${JSON.stringify(validationResult.refLang)};
    const TOTAL_KEYS = ${validationResult.totalKeys};
    const STATIC_MODE = ${staticMode ? 'true' : 'false'};

    // ── Dynamic sticky offsets ──
    function updateStickyOffsets() {
      const root = document.documentElement;
      const headerEl = document.querySelector('.header');
      const tabsEl = document.querySelector('.tabs-bar');
      const toolbarEl = document.querySelector('.toolbar');
      if (headerEl) root.style.setProperty('--header-h', headerEl.offsetHeight + 'px');
      if (tabsEl) root.style.setProperty('--tabs-h', tabsEl.offsetHeight + 'px');
      if (toolbarEl) root.style.setProperty('--toolbar-h', toolbarEl.offsetHeight + 'px');
    }
    updateStickyOffsets();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => updateStickyOffsets());
      document.querySelectorAll('.header, .tabs-bar, .toolbar').forEach(el => ro.observe(el));
    } else {
      window.addEventListener('resize', updateStickyOffsets);
    }

    // ── Dark mode toggle ──
    const darkToggle = document.getElementById('darkToggle');
    const savedTheme = localStorage.getItem('translation-toolkit-theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.body.classList.add('dark');
      darkToggle.textContent = '☀️';
    }
    darkToggle.addEventListener('click', () => {
      document.body.classList.toggle('dark');
      const isDark = document.body.classList.contains('dark');
      darkToggle.textContent = isDark ? '☀️' : '🌙';
      localStorage.setItem('translation-toolkit-theme', isDark ? 'dark' : 'light');
    });

    // ── Tab switching ──
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabPanels.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
      });
    });

    // ══════════════════════════════════════════
    //  TRANSLATIONS TAB
    // ══════════════════════════════════════════

    const searchEl = document.getElementById('search');
    const langFilterEl = document.getElementById('langFilter');
    const missingOnlyEl = document.getElementById('missingOnly');
    const statsEl = document.getElementById('stats');
    const theadEl = document.getElementById('thead');
    const tbodyEl = document.getElementById('tbody');

    LANGUAGES.forEach(lang => {
      const opt = document.createElement('option');
      opt.value = lang;
      opt.textContent = lang.toUpperCase();
      langFilterEl.appendChild(opt);
    });

    function buildHeader(visibleLangs) {
      let html = '<tr><th class="col-key">#</th><th class="col-key">Key</th>';
      visibleLangs.forEach(lang => {
        html += '<th class="col-lang">' + lang.toUpperCase() + '</th>';
      });
      html += '</tr>';
      theadEl.innerHTML = html;
    }

    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function highlightText(text, query) {
      if (!query) return escapeHtml(text);
      const escaped = escapeHtml(text);
      const regex = new RegExp('(' + query.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&') + ')', 'gi');
      return escaped.replace(regex, '<span class="highlight">$1</span>');
    }

    const pendingChanges = new Map(); // 'key|||lang' → newValue

    function renderTranslations() {
      const query = searchEl.value.trim().toLowerCase();
      const langFilter = langFilterEl.value;
      const missingOnly = missingOnlyEl.checked;

      const visibleLangs = langFilter ? [langFilter] : LANGUAGES;
      buildHeader(visibleLangs);

      let html = '';
      let shown = 0;
      let total = DATA.length;

      DATA.forEach((row, idx) => {
        if (missingOnly) {
          const hasMissing = visibleLangs.some(lang => !row.translations[lang]);
          if (!hasMissing) return;
        }

        if (query) {
          const keyMatch = row.key.toLowerCase().includes(query);
          const valueMatch = visibleLangs.some(lang =>
            (row.translations[lang] || '').toLowerCase().includes(query)
          );
          if (!keyMatch && !valueMatch) return;
        }

        shown++;
        const isPl = row.isPlural;
        html += '<tr' + (isPl ? ' class="plural-row"' : '') + '>';
        html += '<td class="cell-key" style="color:#999;font-size:12px">' + shown + '</td>';
        html += '<td class="cell-key">' + highlightText(row.key, searchEl.value.trim()) + (isPl ? ' <span class="plural-badge">plural</span>' : '') + '</td>';
        visibleLangs.forEach(lang => {
          const val = row.translations[lang] || '';
          // Check if there's a pending change for this cell
          const changeKey = row.key + '|||' + lang;
          const hasPending = pendingChanges.has(changeKey);
          const displayVal = hasPending ? pendingChanges.get(changeKey) : val;
          if (displayVal) {
            html += '<td class="cell-value' + (hasPending ? ' cell-flash' : '') + '" data-key="' + escapeHtml(row.key) + '" data-lang="' + lang + '">' + highlightText(displayVal, searchEl.value.trim()) + '</td>';
          } else {
            html += '<td class="cell-empty" data-key="' + escapeHtml(row.key) + '" data-lang="' + lang + '">— missing —</td>';
          }
        });
        html += '</tr>';
      });

      tbodyEl.innerHTML = html || '<tr><td colspan="' + (visibleLangs.length + 2) + '" style="text-align:center;padding:40px;color:#999">No matching translations found</td></tr>';
      statsEl.textContent = shown + ' / ' + total + ' keys';
    }

    searchEl.addEventListener('input', renderTranslations);
    langFilterEl.addEventListener('change', renderTranslations);
    missingOnlyEl.addEventListener('change', renderTranslations);

    renderTranslations();

    // ══════════════════════════════════════════
    //  VALIDATION TAB
    // ══════════════════════════════════════════

    const valSearchEl = document.getElementById('valSearch');
    const valSeverityEl = document.getElementById('valSeverity');
    const valTypeEl = document.getElementById('valType');
    const valLangEl = document.getElementById('valLang');
    const valStatsEl = document.getElementById('valStats');
    const valSummaryEl = document.getElementById('valSummary');
    const valContentEl = document.getElementById('valContent');

    // Populate language filter for validation
    const valLangs = [...new Set(ISSUES.map(i => i.lang))].sort();
    valLangs.forEach(lang => {
      const opt = document.createElement('option');
      opt.value = lang;
      opt.textContent = lang.toUpperCase();
      valLangEl.appendChild(opt);
    });

    function renderSummary() {
      const errors = ISSUES.filter(i => i.severity === 'error').length;
      const warnings = ISSUES.filter(i => i.severity === 'warning').length;

      if (ISSUES.length === 0) {
        valSummaryEl.innerHTML = '';
        return;
      }

      // Count by type
      const byType = {};
      ISSUES.forEach(i => { byType[i.type] = (byType[i.type] || 0) + 1; });

      let html = '';
      html += '<div class="val-card errors"><div class="number">' + errors + '</div><div class="label">Errors</div></div>';
      html += '<div class="val-card warnings"><div class="number">' + warnings + '</div><div class="label">Warnings</div></div>';
      html += '<div class="val-card"><div class="number">' + TOTAL_KEYS + '</div><div class="label">Total keys</div></div>';

      // Per-type cards
      const typeNames = { 'missing-key': 'Missing keys', 'extra-key': 'Extra keys', 'empty-translation': 'Empty translations', 'variable-mismatch': 'Variable mismatches' };
      for (const [type, count] of Object.entries(byType)) {
        html += '<div class="val-card"><div class="number">' + count + '</div><div class="label">' + (typeNames[type] || type) + '</div></div>';
      }

      valSummaryEl.innerHTML = html;
    }

    function renderValidation() {
      const query = valSearchEl.value.trim().toLowerCase();
      const severityFilter = valSeverityEl.value;
      const typeFilter = valTypeEl.value;
      const langFilter = valLangEl.value;

      if (ISSUES.length === 0) {
        valContentEl.innerHTML = '<div class="val-empty-state"><div class="icon">✓</div>No issues found.<br>All translations are consistent.</div>';
        valStatsEl.textContent = '';
        return;
      }

      let filtered = ISSUES;

      if (severityFilter) {
        filtered = filtered.filter(i => i.severity === severityFilter);
      }
      if (typeFilter) {
        filtered = filtered.filter(i => i.type === typeFilter);
      }
      if (langFilter) {
        filtered = filtered.filter(i => i.lang === langFilter);
      }
      if (query) {
        filtered = filtered.filter(i =>
          i.key.toLowerCase().includes(query) ||
          i.message.toLowerCase().includes(query) ||
          i.type.toLowerCase().includes(query)
        );
      }

      valStatsEl.textContent = filtered.length + ' / ' + ISSUES.length + ' issues';

      if (filtered.length === 0) {
        valContentEl.innerHTML = '<div style="text-align:center;padding:40px;color:#999">No issues match the current filters</div>';
        return;
      }

      const typeLabels = {
        'missing-key': 'missing key',
        'extra-key': 'extra key',
        'empty-translation': 'empty',
        'variable-mismatch': 'variable',
      };

      let html = '<div style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08)">';

      filtered.forEach(issue => {
        const icon = issue.severity === 'error' ? '✗' : '⚠';
        const iconClass = issue.severity;
        const typeClass = issue.type;
        const typeLabel = typeLabels[issue.type] || issue.type;

        html += '<div class="val-issue-row">';
        html += '  <div class="val-icon ' + iconClass + '">' + icon + '</div>';
        html += '  <div class="val-issue-lang">' + issue.lang.toUpperCase() + '</div>';
        html += '  <div class="val-issue-body">';
        html += '    <div class="val-issue-key">' + escapeHtml(issue.key) + '<span class="val-type-badge ' + typeClass + '">' + typeLabel + '</span></div>';
        html += '    <div class="val-issue-msg">' + escapeHtml(issue.message) + '</div>';
        html += '  </div>';
        html += '</div>';
      });

      html += '</div>';
      valContentEl.innerHTML = html;
    }

    renderSummary();
    renderValidation();

    valSearchEl.addEventListener('input', renderValidation);
    valSeverityEl.addEventListener('change', renderValidation);
    valTypeEl.addEventListener('change', renderValidation);
    valLangEl.addEventListener('change', renderValidation);

    // ══════════════════════════════════════════
    //  STATISTICS TAB
    // ══════════════════════════════════════════

    const statsOverviewEl = document.getElementById('statsOverview');
    const statsGridEl = document.getElementById('statsGrid');

    function coverageClass(pct) {
      if (pct >= 90) return 'high';
      if (pct >= 60) return 'mid';
      return 'low';
    }

    function valueClass(val, warnThreshold, badThreshold) {
      if (val >= badThreshold) return 'bad';
      if (val >= warnThreshold) return 'warn';
      return '';
    }

    function renderStats() {
      if (!STATS_DATA || !STATS_DATA.langStats || STATS_DATA.langStats.length === 0) {
        statsOverviewEl.innerHTML = '';
        statsGridEl.innerHTML = '<div style="text-align:center;padding:60px;color:#999">No translation files found</div>';
        return;
      }

      // Overview cards
      let ov = '';
      ov += '<div class="val-card"><div class="number">' + STATS_DATA.refKeyCount + '</div><div class="label">Total keys</div></div>';
      ov += '<div class="val-card"><div class="number">' + STATS_DATA.languages.length + '</div><div class="label">Languages</div></div>';

      const covClass = STATS_DATA.overallCoverage >= 90 ? 'ok' : (STATS_DATA.overallCoverage >= 60 ? 'warnings' : 'errors');
      ov += '<div class="val-card ' + covClass + '"><div class="number">' + STATS_DATA.overallCoverage + '%</div><div class="label">Overall coverage</div></div>';
      statsOverviewEl.innerHTML = ov;

      // Per-language cards
      let html = '';
      STATS_DATA.langStats.forEach(stat => {
        const isRef = stat.lang === STATS_DATA.refLang;
        const covCls = coverageClass(stat.coverage);

        html += '<div class="lang-card">';
        html += '  <div class="lang-card-header">';
        html += '    <span class="lang-name">' + stat.lang + '</span>';
        html += '    <span class="lang-tag' + (isRef ? ' ref' : '') + '">' + (isRef ? 'Reference' : stat.coverage + '% coverage') + '</span>';
        html += '  </div>';

        // Coverage bar
        html += '  <div class="coverage-bar-container">';
        html += '    <div class="coverage-bar-fill ' + covCls + '" style="width:' + Math.max(stat.coverage, 3) + '%">' + stat.coverage + '%</div>';
        html += '  </div>';

        // Stats grid
        html += '  <div class="lang-card-stats">';
        html += '    <div class="lang-stat-item"><span class="stat-label">Translated</span><span class="stat-value">' + stat.translatedKeys + ' / ' + STATS_DATA.refKeyCount + '</span></div>';
        html += '    <div class="lang-stat-item"><span class="stat-label">Empty</span><span class="stat-value ' + valueClass(stat.emptyKeys, 1, 10) + '">' + stat.emptyKeys + '</span></div>';
        html += '    <div class="lang-stat-item"><span class="stat-label">Missing</span><span class="stat-value ' + valueClass(stat.missingKeys, 1, 10) + '">' + stat.missingKeys + '</span></div>';
        html += '    <div class="lang-stat-item"><span class="stat-label">Extra</span><span class="stat-value ' + valueClass(stat.extraKeys, 1, 5) + '">' + stat.extraKeys + '</span></div>';
        html += '  </div>';

        // Top missing keys
        if (!isRef && stat.topMissing && stat.topMissing.length > 0) {
          html += '  <details class="lang-card-missing">';
          html += '    <summary>Top missing keys (' + stat.missingKeys + ' total)</summary>';
          html += '    <ul class="missing-list">';
          stat.topMissing.forEach(key => {
            html += '      <li>' + escapeHtml(key) + '</li>';
          });
          if (stat.missingKeys > stat.topMissing.length) {
            html += '      <li style="color:#999;font-style:italic">… and ' + (stat.missingKeys - stat.topMissing.length) + ' more</li>';
          }
          html += '    </ul>';
          html += '  </details>';
        }

        html += '</div>';
      });

      statsGridEl.innerHTML = html;
    }

    renderStats();

    // ══════════════════════════════════════════
    //  INLINE EDITING
    // ══════════════════════════════════════════

    const saveBar = document.getElementById('saveBar');
    const changesCountEl = document.getElementById('changesCount');

    function updateSaveBar() {
      if (STATIC_MODE) return;
      const count = pendingChanges.size;
      if (count > 0) {
        saveBar.classList.add('visible');
        changesCountEl.textContent = count + ' unsaved change' + (count !== 1 ? 's' : '');
      } else {
        saveBar.classList.remove('visible');
      }
    }

    // Click to edit a cell
    tbodyEl.addEventListener('click', function(e) {
      if (STATIC_MODE) return; // Read-only in static mode
      const td = e.target.closest('td[data-key][data-lang]');
      if (!td || td.classList.contains('editing')) return;
      // Plural rows are read-only (no save support)
      if (td.closest('tr.plural-row')) return;

      const key = td.getAttribute('data-key');
      const lang = td.getAttribute('data-lang');
      const changeKey = key + '|||' + lang;

      // Get current value: pending change > DATA
      let currentVal;
      if (pendingChanges.has(changeKey)) {
        currentVal = pendingChanges.get(changeKey);
      } else {
        const row = DATA.find(r => r.key === key);
        currentVal = row ? (row.translations[lang] || '') : '';
      }

      td.classList.add('editing');
      td.innerHTML = '';

      const textarea = document.createElement('textarea');
      textarea.value = currentVal;
      td.appendChild(textarea);
      textarea.focus();
      textarea.select();

      function finishEdit() {
        const newVal = textarea.value;
        td.classList.remove('editing');

        // Find original value
        const row = DATA.find(r => r.key === key);
        const originalVal = row ? (row.translations[lang] || '') : '';

        if (newVal !== originalVal) {
          pendingChanges.set(changeKey, newVal);
          // Also update DATA so re-renders show the new value
          if (row) row.translations[lang] = newVal;
        } else {
          pendingChanges.delete(changeKey);
        }

        // Re-render cell
        if (newVal) {
          td.className = 'cell-value cell-flash';
          td.textContent = newVal;
        } else {
          td.className = 'cell-empty';
          td.textContent = '— missing —';
        }

        updateSaveBar();
      }

      textarea.addEventListener('blur', finishEdit);
      textarea.addEventListener('keydown', function(ev) {
        if (ev.key === 'Escape') {
          textarea.removeEventListener('blur', finishEdit);
          // Restore without saving
          td.classList.remove('editing');
          const row = DATA.find(r => r.key === key);
          const val = pendingChanges.has(changeKey) ? pendingChanges.get(changeKey) : (row ? (row.translations[lang] || '') : '');
          if (val) {
            td.className = 'cell-value';
            td.textContent = val;
          } else {
            td.className = 'cell-empty';
            td.textContent = '— missing —';
          }
        }
        if (ev.key === 'Enter' && !ev.shiftKey) {
          ev.preventDefault();
          textarea.blur();
        }
      });
    });

    // Save button
    const btnSave = document.getElementById('btnSave');
    const btnDiscard = document.getElementById('btnDiscard');
    if (!STATIC_MODE && btnSave) {
      btnSave.addEventListener('click', async function() {
        if (pendingChanges.size === 0) return;

        btnSave.disabled = true;
        btnSave.textContent = 'Saving...';

        // Group changes by lang
        const changesByLang = {};
        for (const [changeKey, newVal] of pendingChanges) {
          const [key, lang] = changeKey.split('|||');
          if (!changesByLang[lang]) changesByLang[lang] = {};
          changesByLang[lang][key] = newVal;
        }

        try {
          const res = await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ changes: changesByLang }),
          });

          const result = await res.json();

          if (result.ok) {
            pendingChanges.clear();
            updateSaveBar();
            // Flash all visible cells briefly
            document.querySelectorAll('.cell-flash').forEach(el => {
              el.classList.remove('cell-flash');
            });
          } else {
            alert('Save failed: ' + (result.error || 'Unknown error'));
          }
        } catch (err) {
          alert('Save failed: ' + err.message);
        }

        btnSave.disabled = false;
        btnSave.textContent = 'Save to .po files';
      });
    }

    // Discard button
    if (!STATIC_MODE && btnDiscard) {
      btnDiscard.addEventListener('click', function() {
        if (pendingChanges.size === 0) return;
        if (!confirm('Discard ' + pendingChanges.size + ' unsaved change(s)?')) return;

        // Revert DATA to original values would require storing originals.
        // For simplicity, just reload the page.
        location.reload();
      });
    }

    // ══════════════════════════════════════════
    //  DIFF TAB
    // ══════════════════════════════════════════

    const diffModeBtns = document.querySelectorAll('.diff-mode-btn');
    const diffFileB = document.getElementById('diffFileB');
    const diffInputA = document.getElementById('diffInputA');
    const diffInputB = document.getElementById('diffInputB');
    const diffFileAName = document.getElementById('diffFileAName');
    const diffFileBName = document.getElementById('diffFileBName');
    const diffRunBtn = document.getElementById('diffRunBtn');
    const diffResults = document.getElementById('diffResults');
    const diffSummary = document.getElementById('diffSummary');
    const diffContent = document.getElementById('diffContent');
    const diffUploadZone = document.getElementById('diffUploadZone');

    let diffMode = STATIC_MODE ? 'csv-vs-csv' : 'csv-vs-po';
    let fileAContent = null;
    let fileBContent = null;

    if (STATIC_MODE) {
      // In static mode, show second file box by default (csv-vs-csv only)
      diffFileB.style.display = '';
    }

    diffModeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        diffModeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        diffMode = btn.dataset.mode;

        if (diffMode === 'csv-vs-csv') {
          diffFileB.style.display = '';
        } else {
          diffFileB.style.display = 'none';
        }
        updateDiffRunBtn();
      });
    });

    function updateDiffRunBtn() {
      if (diffMode === 'csv-vs-po') {
        diffRunBtn.disabled = !fileAContent;
      } else {
        diffRunBtn.disabled = !fileAContent || !fileBContent;
      }
    }

    diffInputA.addEventListener('change', function() {
      const file = this.files[0];
      if (!file) return;
      diffFileAName.textContent = file.name;
      document.getElementById('diffFileA').classList.add('has-file');
      const reader = new FileReader();
      reader.onload = () => { fileAContent = reader.result; updateDiffRunBtn(); };
      reader.readAsText(file);
    });

    diffInputB.addEventListener('change', function() {
      const file = this.files[0];
      if (!file) return;
      diffFileBName.textContent = file.name;
      document.getElementById('diffFileB').classList.add('has-file');
      const reader = new FileReader();
      reader.onload = () => { fileBContent = reader.result; updateDiffRunBtn(); };
      reader.readAsText(file);
    });

    // ── Client-side CSV parser (for static mode diff) ──
    function parseCsvString(content, delimiter) {
      const rows = [];
      let current = '';
      let fields = [];
      let inQuotes = false;
      let ci = 0;
      while (ci < content.length) {
        const ch = content[ci];
        if (inQuotes) {
          if (ch === '"') {
            if (ci + 1 < content.length && content[ci + 1] === '"') {
              current += '"'; ci += 2;
            } else {
              inQuotes = false; ci++;
            }
          } else { current += ch; ci++; }
        } else {
          if (ch === '"') { inQuotes = true; ci++; }
          else if (ch === delimiter) { fields.push(current); current = ''; ci++; }
          else if (ch === '\\n') { fields.push(current); current = ''; if (fields.some(f => f.trim() !== '')) rows.push(fields); fields = []; ci++; }
          else if (ch === '\\r') { ci++; }
          else { current += ch; ci++; }
        }
      }
      fields.push(current);
      if (fields.some(f => f.trim() !== '')) rows.push(fields);
      return rows;
    }

    function csvToData(content) {
      // Auto-detect delimiter: pipe or comma
      const firstLine = content.split('\\n')[0] || '';
      const delimiter = firstLine.includes('|') ? '|' : ',';
      const rows = parseCsvString(content, delimiter);
      if (rows.length < 1) return { languages: [], rows: new Map() };
      const langs = rows[0].slice(1).map(l => l.trim());
      const dataMap = new Map();
      for (let i = 1; i < rows.length; i++) {
        const f = rows[i]; const key = (f[0] || '').trim(); if (!key) continue;
        const trans = {};
        for (let j = 0; j < langs.length; j++) trans[langs[j]] = (f[j+1] || '').trim();
        dataMap.set(key, trans);
      }
      return { languages: langs, rows: dataMap };
    }

    function clientDiff(oldData, newData) {
      const entries = [];
      let addedKeys = 0, removedKeys = 0, changedValues = 0;
      const allLangs = [...new Set([...oldData.languages, ...newData.languages])].sort();
      for (const [key, nt] of newData.rows) {
        if (!oldData.rows.has(key)) {
          addedKeys++;
          entries.push({ type: 'added', key, lang: '', oldValue: '', newValue: allLangs.map(l => nt[l] || '').filter(Boolean).join(' | ') });
        }
      }
      for (const [key, ot] of oldData.rows) {
        if (!newData.rows.has(key)) {
          removedKeys++;
          entries.push({ type: 'removed', key, lang: '', oldValue: allLangs.map(l => ot[l] || '').filter(Boolean).join(' | '), newValue: '' });
        }
      }
      for (const [key, ot] of oldData.rows) {
        if (!newData.rows.has(key)) continue;
        const nt = newData.rows.get(key);
        for (const lang of allLangs) {
          const ov = ot[lang] || '', nv = nt[lang] || '';
          if (ov !== nv) { changedValues++; entries.push({ type: 'changed', key, lang, oldValue: ov, newValue: nv }); }
        }
      }
      entries.sort((a, b) => {
        const order = { added: 0, removed: 1, changed: 2 };
        return a.type !== b.type ? order[a.type] - order[b.type] : a.key.localeCompare(b.key);
      });
      return { entries, addedKeys, removedKeys, changedValues };
    }

    diffRunBtn.addEventListener('click', async function() {
      diffRunBtn.disabled = true;
      diffRunBtn.textContent = 'Comparing...';

      try {
        if (STATIC_MODE) {
          // Client-side diff
          const oldData = csvToData(fileAContent);
          const newData = csvToData(fileBContent);
          const diff = clientDiff(oldData, newData);
          renderDiffResults(diff);
        } else {
          const payload = {
            mode: diffMode,
            csvA: fileAContent,
          };
          if (diffMode === 'csv-vs-csv') {
            payload.csvB = fileBContent;
          }

          const res = await fetch('/api/diff', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          const result = await res.json();

          if (!result.ok) {
            alert('Diff failed: ' + (result.error || 'Unknown error'));
            return;
          }

          renderDiffResults(result.diff);
        }
      } catch (err) {
        alert('Diff failed: ' + err.message);
      }

      diffRunBtn.disabled = false;
      diffRunBtn.textContent = 'Compare';
    });

    function renderDiffResults(diff) {
      diffResults.style.display = '';

      // Summary cards
      let shtml = '';
      shtml += '<div class="val-card" style="border-left:4px solid #16a34a"><div class="number" style="color:#16a34a">+' + diff.addedKeys + '</div><div class="label">Added keys</div></div>';
      shtml += '<div class="val-card" style="border-left:4px solid #dc2626"><div class="number" style="color:#dc2626">-' + diff.removedKeys + '</div><div class="label">Removed keys</div></div>';
      shtml += '<div class="val-card" style="border-left:4px solid #d97706"><div class="number" style="color:#d97706">~' + diff.changedValues + '</div><div class="label">Changed values</div></div>';
      diffSummary.innerHTML = shtml;

      if (diff.entries.length === 0) {
        diffContent.innerHTML = '<div style="text-align:center;padding:60px;color:#16a34a;font-size:18px"><div style="font-size:48px;margin-bottom:12px">\u2713</div>No differences found.</div>';
        return;
      }

      let html = '';
      diff.entries.forEach(entry => {
        const badgeClass = entry.type;
        const badgeIcon = entry.type === 'added' ? '+' : entry.type === 'removed' ? '\u2212' : '~';

        html += '<div class="diff-entry">';
        html += '  <div class="diff-badge ' + badgeClass + '">' + badgeIcon + '</div>';
        html += '  <div class="diff-entry-body">';
        html += '    <div class="diff-entry-key">' + escapeHtml(entry.key);
        if (entry.lang) {
          html += '<span class="diff-entry-lang">' + entry.lang + '</span>';
        }
        html += '</div>';

        if (entry.type === 'removed' || entry.type === 'changed') {
          html += '    <div class="diff-old">\u2212 ' + escapeHtml(entry.oldValue || '(empty)') + '</div>';
        }
        if (entry.type === 'added' || entry.type === 'changed') {
          html += '    <div class="diff-new">+ ' + escapeHtml(entry.newValue || '(empty)') + '</div>';
        }

        html += '  </div>';
        html += '</div>';
      });

      diffContent.innerHTML = html;
    }
  </script>
</body>
</html>`;
}

/**
 * Load translations and start preview server.
 *
 * @param {string} translationsDir
 * @param {number} port
 */
async function startPreview(translationsDir, port, watchMode = false) {
  function loadAll() {
    const poFiles = discoverPoFiles(translationsDir);

    if (poFiles.length === 0) {
      console.error('No .po files found in', translationsDir);
      process.exit(1);
    }

    poFiles.sort((a, b) => a.shortCode.localeCompare(b.shortCode));

    const allTranslations = new Map();
    const allPluralTranslations = new Map();
    const allKeys = new Set();
    const allPluralKeys = new Set();

    for (const poFile of poFiles) {
      const { entries, pluralEntries } = parsePo(poFile.filePath);
      allTranslations.set(poFile.shortCode, entries);
      allPluralTranslations.set(poFile.shortCode, pluralEntries);
      for (const key of entries.keys()) {
        allKeys.add(key);
      }
      for (const key of pluralEntries.keys()) {
        allPluralKeys.add(key);
      }
    }

    const languages = poFiles.map((f) => f.shortCode);
    const rows = [...allKeys].map((rawKey) => {
      const displayKey = rawKey.replace('\x04', '::');
      const translations = {};
      for (const lang of languages) {
        const entries = allTranslations.get(lang);
        translations[lang] = entries ? entries.get(rawKey) || '' : '';
      }
      return { key: displayKey, translations };
    });

    // Add plural rows as key[N]
    for (const rawKey of allPluralKeys) {
      const displayKey = rawKey.includes('\x04') ? rawKey.replace('\x04', '::') : rawKey;
      let maxForms = 0;
      for (const lang of languages) {
        const pe = allPluralTranslations.get(lang);
        const entry = pe ? pe.get(rawKey) : null;
        if (entry) maxForms = Math.max(maxForms, entry.msgstr.length);
      }
      for (let n = 0; n < maxForms; n++) {
        const translations = {};
        for (const lang of languages) {
          const pe = allPluralTranslations.get(lang);
          const entry = pe ? pe.get(rawKey) : null;
          translations[lang] = entry && n < entry.msgstr.length ? entry.msgstr[n] : '';
        }
        rows.push({ key: displayKey + '[' + n + ']', translations, isPlural: true, pluralForm: n });
      }
    }

    const validationResult = validateTranslations(translationsDir);
    const statsResult = computeStats(translationsDir);
    const html = buildHtml(rows, languages, translationsDir, validationResult, statsResult);

    const shortCodeToFile = new Map();
    for (const pf of poFiles) {
      shortCodeToFile.set(pf.shortCode, pf);
    }

    return { html, shortCodeToFile, rows, languages, validationResult };
  }

  let state = loadAll();
  let dirty = false;

  // Watch for .po file changes
  if (watchMode) {
    let debounce = null;
    fs.watch(translationsDir, { recursive: false }, (eventType, filename) => {
      if (filename && filename.endsWith('.po')) {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          try {
            state = loadAll();
            dirty = false;
            console.log(`  ↻ Reloaded (${filename} changed)`);
          } catch (err) {
            console.error(`  ✗ Reload failed: ${err.message}`);
          }
        }, 300);
      }
    });
  }

  const server = http.createServer((req, res) => {
    // ── POST /api/save ──
    if (req.method === 'POST' && req.url === '/api/save') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const { changes } = JSON.parse(body);
          // changes = { lang: { key: newValue, ... }, ... }

          for (const [lang, keyValues] of Object.entries(changes)) {
            const poFile = state.shortCodeToFile.get(lang);
            if (!poFile) continue;

            const parsed = parsePo(poFile.filePath);
            const meta = extractMeta(parsed.header);

            for (const [key, value] of Object.entries(keyValues)) {
              // Convert display :: separator back to internal \x04
              const internalKey = key.replace('::', '\x04');
              parsed.entries.set(internalKey, value);
            }

            writePo(poFile.filePath, {
              language: meta.language || poFile.locale,
              pluralForms: meta.pluralForms,
            }, parsed.entries);
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    // ── POST /api/diff ──
    if (req.method === 'POST' && req.url === '/api/diff') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const { mode, csvA, csvB } = JSON.parse(body);
          const delimiter = '|';

          // Parse CSV from string content
          function parseCsvString(content) {
            const lines = content.split('\\n').filter((l) => l.trim() !== '');
            if (lines.length < 1) return { languages: [], rows: new Map() };
            const headerFields = lines[0].split(delimiter);
            const languages = headerFields.slice(1).map(l => l.trim());
            const rows = new Map();
            for (let i = 1; i < lines.length; i++) {
              const fields = lines[i].split(delimiter);
              const key = fields[0];
              if (!key) continue;
              const translations = {};
              for (let j = 0; j < languages.length; j++) {
                translations[languages[j]] = (fields[j + 1] || '').trim();
              }
              rows.set(key, translations);
            }
            return { languages, rows };
          }

          let oldData, newData;
          if (mode === 'csv-vs-csv') {
            oldData = parseCsvString(csvA);
            newData = parseCsvString(csvB);
          } else {
            // csv-vs-po: CSV is "old", current .po is "new"
            oldData = parseCsvString(csvA);
            newData = loadPoAsCsv(translationsDir);
          }

          const diff = computeDiff(oldData, newData);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, diff }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    // ── GET (everything else) ──
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(state.html);
  });

  // Try to listen, auto-increment port if busy
  function tryListen(tryPort) {
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        const nextPort = tryPort + 1;
        if (nextPort > port + 20) {
          console.error(`\n  ✗ Could not find a free port (tried ${port}–${nextPort - 1}). Aborting.\n`);
          process.exit(1);
        }
        console.log(`  Port ${tryPort} is in use, trying ${nextPort}...`);
        server.removeAllListeners('listening');
        tryListen(nextPort);
      } else {
        throw err;
      }
    });

    server.listen(tryPort, () => {
      const issueCount = state.validationResult.issues.length;
      console.log(`\n  Translation preview running at:\n`);
      console.log(`  → http://localhost:${tryPort}\n`);
      if (tryPort !== port) {
        console.log(`  (requested port ${port} was in use)`);
      }
      console.log(`  ${state.rows.length} keys × ${state.languages.length} languages (${state.languages.join(', ')})`);
      console.log(`  Validation: ${issueCount === 0 ? '✓ no issues' : issueCount + ' issues found'}`);
      if (watchMode) {
        console.log(`  Watch mode: ON — auto-reloads when .po files change`);
      }
      console.log(`  Press Ctrl+C to stop.\n`);
    });
  }

  tryListen(port);
}

/**
 * Generate a standalone HTML file (no server needed).
 *
 * @param {string} translationsDir
 * @param {string} outputPath
 */
async function generateStaticPreview(translationsDir, outputPath) {
  const poFiles = discoverPoFiles(translationsDir);

  if (poFiles.length === 0) {
    console.error('No .po files found in', translationsDir);
    process.exit(1);
  }

  poFiles.sort((a, b) => a.shortCode.localeCompare(b.shortCode));

  const allTranslations = new Map();
  const allPluralTranslations = new Map();
  const allKeys = new Set();
  const allPluralKeys = new Set();

  for (const poFile of poFiles) {
    const { entries, pluralEntries } = parsePo(poFile.filePath);
    allTranslations.set(poFile.shortCode, entries);
    allPluralTranslations.set(poFile.shortCode, pluralEntries);
    for (const key of entries.keys()) {
      allKeys.add(key);
    }
    for (const key of pluralEntries.keys()) {
      allPluralKeys.add(key);
    }
  }

  const languages = poFiles.map((f) => f.shortCode);
  const rows = [...allKeys].map((rawKey) => {
    const displayKey = rawKey.replace('\x04', '::');
    const translations = {};
    for (const lang of languages) {
      const entries = allTranslations.get(lang);
      translations[lang] = entries ? entries.get(rawKey) || '' : '';
    }
    return { key: displayKey, translations };
  });

  // Add plural rows as key[N]
  for (const rawKey of allPluralKeys) {
    const displayKey = rawKey.includes('\x04') ? rawKey.replace('\x04', '::') : rawKey;
    let maxForms = 0;
    for (const lang of languages) {
      const pe = allPluralTranslations.get(lang);
      const entry = pe ? pe.get(rawKey) : null;
      if (entry) maxForms = Math.max(maxForms, entry.msgstr.length);
    }
    for (let n = 0; n < maxForms; n++) {
      const translations = {};
      for (const lang of languages) {
        const pe = allPluralTranslations.get(lang);
        const entry = pe ? pe.get(rawKey) : null;
        translations[lang] = entry && n < entry.msgstr.length ? entry.msgstr[n] : '';
      }
      rows.push({ key: displayKey + '[' + n + ']', translations, isPlural: true, pluralForm: n });
    }
  }

  const validationResult = validateTranslations(translationsDir);
  const statsResult = computeStats(translationsDir);
  const html = buildHtml(rows, languages, translationsDir, validationResult, statsResult, true);

  const dir = require('path').dirname(outputPath);
  if (dir && dir !== '.') {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, html, 'utf-8');

  const fileSize = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log(`\n  ✓ Static preview generated: ${outputPath}`);
  console.log(`    ${rows.length} keys × ${languages.length} languages (${languages.join(', ')})`);
  console.log(`    Validation: ${validationResult.issues.length === 0 ? '✓ no issues' : validationResult.issues.length + ' issues'}`);
  console.log(`    File size: ${fileSize} KB`);
  console.log(`\n  Open in browser: file://${require('path').resolve(outputPath)}\n`);
}

/**
 * Parse CLI args and run preview.
 * @param {string[]} args
 */
async function runPreview(args) {
  let dirArg;
  let port = 3456;
  let watchMode = false;
  let staticMode = false;
  let outputPath = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' || args[i] === '-d') {
      dirArg = args[i + 1];
      i++;
    } else if (args[i] === '--port' || args[i] === '-p') {
      port = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--watch' || args[i] === '-w') {
      watchMode = true;
    } else if (args[i] === '--static' || args[i] === '-s') {
      staticMode = true;
    } else if (args[i] === '--output' || args[i] === '-o') {
      outputPath = args[i + 1];
      i++;
    }
  }

  const translationsDir = await resolveTranslationsDir(dirArg);

  if (staticMode) {
    if (watchMode) {
      console.error('Error: --watch cannot be used with --static');
      process.exit(1);
    }
    const outFile = outputPath || 'translation-preview/index.html';
    await generateStaticPreview(translationsDir, outFile);
  } else {
    await startPreview(translationsDir, port, watchMode);
  }
}

module.exports = { runPreview, buildHtml, generateStaticPreview };
