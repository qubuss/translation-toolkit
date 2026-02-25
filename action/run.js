#!/usr/bin/env node
'use strict';

/**
 * GitHub Action runner for translation-toolkit.
 *
 * Runs validate + stats (and optionally cross-format validation),
 * formats the results as a Markdown table, and posts/updates a PR comment.
 *
 * Environment variables (set by action.yml):
 *   ACTION_PATH, INPUT_DIR, INPUT_POST_COMMENT, INPUT_FAIL_ON_ERROR,
 *   INPUT_CROSS_FORMAT, INPUT_FORMAT_DIR, INPUT_COMPAT,
 *   GITHUB_TOKEN, GITHUB_EVENT_PATH, GITHUB_REPOSITORY, GITHUB_OUTPUT
 */

const path = require('path');
const fs = require('fs');

// ── Load toolkit modules from the action's own repo ─────────────────────────
const actionPath = process.env.ACTION_PATH || path.join(__dirname, '..');
const toolkit = require(path.join(actionPath, 'index.js'));

const COMMENT_MARKER = '<!-- translation-toolkit-report -->';

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a progress bar string (20 chars wide).
 * @param {number} pct - percentage 0-100
 * @returns {string}
 */
function _progressBar(pct) {
  const filled = Math.round(pct / 5);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(20 - filled);
}

/**
 * Set a GitHub Actions output variable.
 * @param {string} name
 * @param {string} value
 */
function _setOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    fs.appendFileSync(outputFile, `${name}=${value}\n`);
  }
}

/**
 * Post or update a PR comment via the GitHub REST API.
 * Uses Node 18+ global fetch.
 *
 * @param {string} body - Markdown comment body
 * @param {number} prNumber
 */
async function _postOrUpdateComment(body, prNumber) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY; // owner/repo
  if (!token || !repo) {
    console.log('⚠️  GITHUB_TOKEN or GITHUB_REPOSITORY not set — skipping comment');
    return;
  }

  const apiBase = `https://api.github.com/repos/${repo}`;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };

  // 1. Find existing comment with our marker
  let existingCommentId = null;
  try {
    const listRes = await fetch(`${apiBase}/issues/${prNumber}/comments?per_page=100`, { headers });
    if (listRes.ok) {
      const comments = await listRes.json();
      const existing = comments.find(c => c.body && c.body.includes(COMMENT_MARKER));
      if (existing) existingCommentId = existing.id;
    }
  } catch { /* ignore — will create new */ }

  // 2. Update or create
  try {
    if (existingCommentId) {
      await fetch(`${apiBase}/issues/comments/${existingCommentId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ body }),
      });
      console.log('✅ Updated existing PR comment');
    } else {
      await fetch(`${apiBase}/issues/${prNumber}/comments`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ body }),
      });
      console.log('✅ Posted PR comment');
    }
  } catch (err) {
    console.error(`⚠️  Failed to post comment: ${err.message}`);
  }
}

/**
 * Get the PR number from the GitHub event payload.
 * @returns {number|null}
 */
function _getPrNumber() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return null;
  try {
    const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
    return (event.pull_request && event.pull_request.number)
      || (event.issue && event.issue.number)
      || null;
  } catch {
    return null;
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const dir = process.env.INPUT_DIR || 'translations';
  const postComment = (process.env.INPUT_POST_COMMENT || 'true') === 'true';
  const failOnError = (process.env.INPUT_FAIL_ON_ERROR || 'true') === 'true';
  const crossFormat = process.env.INPUT_CROSS_FORMAT || '';
  const formatDir = process.env.INPUT_FORMAT_DIR || '';
  const compat = parseInt(process.env.INPUT_COMPAT || '4', 10);

  // Resolve dir relative to workspace
  const resolvedDir = path.resolve(process.env.GITHUB_WORKSPACE || process.cwd(), dir);

  if (!fs.existsSync(resolvedDir)) {
    console.error(`❌ Directory not found: ${resolvedDir}`);
    process.exit(1);
  }

  // ── 1. Validate ─────────────────────────────────────────────────────────
  console.log(`\n🔍 Validating translations in ${dir}...`);
  const validation = toolkit.validateTranslations(resolvedDir);
  const allIssues = validation.issues || [];
  const errors = allIssues.filter(i => i.severity === 'error');
  const warnings = allIssues.filter(i => i.severity === 'warning');

  console.log(`   ${errors.length} errors, ${warnings.length} warnings`);

  // ── 2. Stats ────────────────────────────────────────────────────────────
  console.log(`📊 Computing statistics...`);
  const stats = toolkit.computeStats(resolvedDir);

  console.log(`   ${stats.languages.length} languages, ${stats.refKeyCount} keys, ${stats.overallCoverage}% coverage`);

  // ── 3. Cross-format (optional) ──────────────────────────────────────────
  let crossFormatIssues = [];
  if (crossFormat && formatDir) {
    const resolvedFormatDir = path.resolve(process.env.GITHUB_WORKSPACE || process.cwd(), formatDir);
    console.log(`🔗 Cross-format check (${crossFormat})...`);
    const cfResult = toolkit.crossFormatValidation(resolvedDir, resolvedFormatDir, crossFormat, compat);
    crossFormatIssues = cfResult.issues || [];
    console.log(`   ${crossFormatIssues.length} issues`);
  }

  // ── 4. Set outputs ──────────────────────────────────────────────────────
  _setOutput('error-count', String(errors.length + crossFormatIssues.filter(i => i.severity === 'error').length));
  _setOutput('warning-count', String(warnings.length + crossFormatIssues.filter(i => i.severity === 'warning').length));
  _setOutput('overall-coverage', String(stats.overallCoverage));

  // ── 5. Build Markdown report ────────────────────────────────────────────
  const md = _buildReport(errors, warnings, stats, crossFormat, crossFormatIssues);

  // Print report to console (always)
  console.log('\n' + md);

  // ── 6. Post PR comment ─────────────────────────────────────────────────
  if (postComment) {
    const prNumber = _getPrNumber();
    if (prNumber) {
      await _postOrUpdateComment(`${COMMENT_MARKER}\n${md}`, prNumber);
    } else {
      console.log('ℹ️  Not a PR event — skipping comment');
    }
  }

  // ── 7. Exit code ────────────────────────────────────────────────────────
  const totalErrors = errors.length + crossFormatIssues.filter(i => i.severity === 'error').length;
  if (failOnError && totalErrors > 0) {
    console.error(`\n❌ ${totalErrors} validation error(s) found — failing`);
    process.exit(1);
  }
}

// ── Report builder ──────────────────────────────────────────────────────────

/**
 * Build a Markdown report from validation + stats results.
 *
 * @param {Array} errors
 * @param {Array} warnings
 * @param {import('../lib/stats').StatsResult} stats
 * @param {string} crossFormat
 * @param {Array} crossFormatIssues
 * @returns {string}
 */
function _buildReport(errors, warnings, stats, crossFormat, crossFormatIssues) {
  const lines = [];

  lines.push('## 🌐 Translation Toolkit Report');
  lines.push('');

  // ── Validation section ────────────────────────────────────────────────
  lines.push('### Validation');
  lines.push('');

  if (errors.length === 0 && warnings.length === 0) {
    lines.push('✅ **No issues found**');
  } else {
    if (errors.length > 0) {
      lines.push(`❌ **${errors.length} error(s)**`);
    }
    if (warnings.length > 0) {
      lines.push(`⚠️ **${warnings.length} warning(s)**`);
    }
    lines.push('');

    // Show errors table (max 20 rows to keep comment readable)
    const issues = [...errors, ...warnings];
    if (issues.length > 0) {
      lines.push('<details>');
      lines.push(`<summary>Show ${issues.length} issue(s)</summary>`);
      lines.push('');
      lines.push('| Severity | Type | Language | Key | Message |');
      lines.push('|----------|------|----------|-----|---------|');
      const maxRows = 30;
      const shown = issues.slice(0, maxRows);
      for (const issue of shown) {
        const sev = errors.includes(issue) ? '❌ error' : '⚠️ warning';
        const key = (issue.key || '').replace(/\x04/g, '::');
        lines.push(`| ${sev} | \`${issue.type}\` | ${issue.lang || '—'} | \`${key}\` | ${issue.message} |`);
      }
      if (issues.length > maxRows) {
        lines.push(`| | | | | *…and ${issues.length - maxRows} more* |`);
      }
      lines.push('');
      lines.push('</details>');
    }
  }

  lines.push('');

  // ── Statistics section ────────────────────────────────────────────────
  lines.push('### Statistics');
  lines.push('');
  lines.push(`📦 **${stats.refKeyCount} keys** (+ ${stats.langStats.length > 0 ? stats.langStats[0].pluralKeys : 0} plural) across **${stats.languages.length} languages**`);
  lines.push('');
  lines.push('| Language | Progress | Translated | Empty | Missing | Fuzzy |');
  lines.push('|----------|----------|------------|-------|---------|-------|');

  for (const ls of stats.langStats) {
    const bar = _progressBar(ls.coverage);
    const isRef = ls.lang === stats.refLang;
    const label = isRef ? `**${ls.lang}** (ref)` : ls.lang;
    lines.push(`| ${label} | \`${bar}\` ${ls.coverage}% | ${ls.translatedKeys}/${ls.totalKeys} | ${ls.emptyKeys} | ${ls.missingKeys} | ${ls.fuzzyKeys} |`);
  }

  lines.push('');
  lines.push(`**Overall coverage: ${stats.overallCoverage}%**`);

  // ── Cross-format section ──────────────────────────────────────────────
  if (crossFormat) {
    lines.push('');
    lines.push(`### Cross-format sync (${crossFormat})`);
    lines.push('');

    if (crossFormatIssues.length === 0) {
      lines.push(`✅ **${crossFormat} exports are in sync with .po files**`);
    } else {
      const cfErrors = crossFormatIssues.filter(i => i.severity === 'error');
      const cfWarnings = crossFormatIssues.filter(i => i.severity === 'warning');
      lines.push(`❌ **${cfErrors.length} error(s)**, ⚠️ **${cfWarnings.length} warning(s)**`);
      lines.push('');
      lines.push('<details>');
      lines.push(`<summary>Show ${crossFormatIssues.length} issue(s)</summary>`);
      lines.push('');
      lines.push('| Severity | Type | Language | Key |');
      lines.push('|----------|------|----------|-----|');
      for (const issue of crossFormatIssues.slice(0, 30)) {
        const sev = issue.severity === 'error' ? '❌' : '⚠️';
        lines.push(`| ${sev} | \`${issue.type}\` | ${issue.lang || '—'} | \`${issue.key || '—'}\` |`);
      }
      if (crossFormatIssues.length > 30) {
        lines.push(`| | | | *…and ${crossFormatIssues.length - 30} more* |`);
      }
      lines.push('');
      lines.push('</details>');
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────
  lines.push('');
  lines.push('---');
  lines.push('*Generated by [translation-toolkit](https://github.com/qubuss/translation-toolkit)*');

  return lines.join('\n');
}

// ── Run ─────────────────────────────────────────────────────────────────────
main().catch(err => {
  console.error(`❌ Action failed: ${err.message}`);
  process.exit(1);
});
