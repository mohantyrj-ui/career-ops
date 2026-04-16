#!/usr/bin/env node

/**
 * morning-scan.mjs — Daily morning scan + email digest
 *
 * Runs scan.mjs as a subprocess, diffs scan-history.tsv before/after
 * to detect new offers, then sends an HTML digest via Resend API.
 *
 * Usage:
 *   node morning-scan.mjs
 *
 * Requires:
 *   RESEND_API_KEY environment variable
 */

import { readFileSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCAN_HISTORY_PATH = join(__dirname, 'data/scan-history.tsv');
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const TO_EMAIL = 'mohantyrj@gmail.com';
const FROM_EMAIL = 'Career Ops <onboarding@resend.dev>';

if (!RESEND_API_KEY) {
  console.error('[morning-scan] Error: RESEND_API_KEY environment variable is not set.');
  process.exit(1);
}

// ── TSV helpers ──────────────────────────────────────────────────────

function readHistoryRows() {
  if (!existsSync(SCAN_HISTORY_PATH)) return new Set();
  const lines = readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n');
  // Skip header, skip empty lines, normalize line endings
  return new Set(lines.slice(1).map(l => l.replace(/\r$/, '')).filter(l => l.trim()));
}

function parseRow(line) {
  const [url, first_seen, portal, title, company, status] = line.split('\t');
  return { url, first_seen, portal, title, company, status };
}

// ── Run scan.mjs ─────────────────────────────────────────────────────

function runScan() {
  const scanScript = join(__dirname, 'scan.mjs');
  const result = spawnSync(process.execPath, [scanScript], {
    cwd: __dirname,
    env: { ...process.env },
    encoding: 'utf-8',
    timeout: 120_000,
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1,
  };
}

// ── Parse scan stats from stdout ─────────────────────────────────────

function parseScanStats(stdout) {
  const get = (label) => {
    const m = stdout.match(new RegExp(`${label}[:\\s]+(\\d+)`));
    return m ? parseInt(m[1], 10) : 0;
  };
  return {
    companiesScanned: get('Companies scanned'),
    totalFound: get('Total jobs found'),
    filteredOut: get('Filtered by title'),
    dupes: get('Duplicates'),
    newAdded: get('New offers added'),
  };
}

// ── HTML helpers ─────────────────────────────────────────────────────

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Email builder ─────────────────────────────────────────────────────

function buildEmail(newOffers, stats, dateStr) {
  const hasOffers = newOffers.length > 0;
  const count = newOffers.length;

  const subject = hasOffers
    ? `[Career Ops] ${count} new offer${count > 1 ? 's' : ''} — ${dateStr}`
    : `[Career Ops] No new offers — ${dateStr}`;

  const offerRows = newOffers.map(o => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:500;color:#111827;">${escHtml(o.company)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">
          <a href="${escHtml(o.url)}" style="color:#2563eb;text-decoration:none;font-weight:500;">${escHtml(o.title)}</a>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;">${escHtml(o.first_seen || '—')}</td>
      </tr>`).join('');

  const tableSection = hasOffers ? `
    <table style="width:100%;border-collapse:collapse;margin-top:20px;font-size:14px;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e7eb;color:#374151;font-size:12px;text-transform:uppercase;letter-spacing:.05em;">Company</th>
          <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e7eb;color:#374151;font-size:12px;text-transform:uppercase;letter-spacing:.05em;">Role</th>
          <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e7eb;color:#374151;font-size:12px;text-transform:uppercase;letter-spacing:.05em;">Found</th>
        </tr>
      </thead>
      <tbody>${offerRows}</tbody>
    </table>` : `
    <p style="color:#6b7280;font-style:italic;margin-top:20px;font-size:14px;">
      No new offers matched your filters today. The pipeline is up to date.
    </p>`;

  const newColor = hasOffers ? '#059669' : '#6b7280';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Career Ops Morning Scan</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:680px;margin:32px auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.12);">

    <!-- Header -->
    <div style="background:#0f172a;padding:28px 32px;">
      <h1 style="margin:0;color:#f8fafc;font-size:20px;font-weight:600;letter-spacing:-.01em;">Career Ops Morning Scan</h1>
      <p style="margin:6px 0 0;color:#94a3b8;font-size:13px;">${escHtml(dateStr)}</p>
    </div>

    <!-- Stats bar -->
    <div style="background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:14px 32px;">
      <p style="margin:0;font-size:13px;color:#64748b;line-height:1.7;">
        Companies scanned: <strong style="color:#1e293b;">${stats.companiesScanned}</strong>
        &nbsp;&nbsp;·&nbsp;&nbsp;
        Jobs found: <strong style="color:#1e293b;">${stats.totalFound}</strong>
        &nbsp;&nbsp;·&nbsp;&nbsp;
        Filtered out: <strong style="color:#1e293b;">${stats.filteredOut}</strong>
        &nbsp;&nbsp;·&nbsp;&nbsp;
        Dupes skipped: <strong style="color:#1e293b;">${stats.dupes}</strong>
        &nbsp;&nbsp;·&nbsp;&nbsp;
        New: <strong style="color:${newColor};">${stats.newAdded}</strong>
      </p>
    </div>

    <!-- Offers table or empty state -->
    <div style="padding:24px 32px 28px;">
      ${tableSection}
    </div>

    <!-- Footer -->
    <div style="padding:16px 32px 24px;border-top:1px solid #f1f5f9;">
      <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
        ${hasOffers
          ? `Run <code style="background:#f3f4f6;padding:1px 5px;border-radius:3px;font-size:11px;">/career-ops pipeline</code> to evaluate new offers. Results saved to <code style="background:#f3f4f6;padding:1px 5px;border-radius:3px;font-size:11px;">data/pipeline.md</code>.`
          : `No action needed today. Your pipeline is current.`}
      </p>
    </div>

  </div>
</body>
</html>`;

  return { html, subject };
}

// ── Send via Resend ───────────────────────────────────────────────────

async function sendEmail(subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: TO_EMAIL,
      subject,
      html,
    }),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Resend API error ${res.status}: ${JSON.stringify(body)}`);
  }
  return body.id;
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Chicago',
  });

  console.log(`[morning-scan] Starting — ${dateStr}`);

  // 1. Snapshot existing history before scan
  const beforeRows = readHistoryRows();
  console.log(`[morning-scan] History snapshot: ${beforeRows.size} existing entries`);

  // 2. Run scan.mjs
  console.log('[morning-scan] Running scan.mjs ...');
  const { stdout, stderr, exitCode } = runScan();

  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  if (exitCode !== 0) {
    console.error(`[morning-scan] Warning: scan.mjs exited with code ${exitCode}`);
  }

  // 3. Diff scan-history.tsv to get exact new offers
  const afterRows = readHistoryRows();
  const newLines = [...afterRows].filter(l => !beforeRows.has(l));
  const newOffers = newLines.map(parseRow);

  console.log(`[morning-scan] New offers detected: ${newOffers.length}`);

  // 4. Parse stats from stdout for email header
  const stats = parseScanStats(stdout);

  // 5. Build and send email
  const { html, subject } = buildEmail(newOffers, stats, dateStr);
  console.log(`[morning-scan] Sending: "${subject}"`);

  const emailId = await sendEmail(subject, html);
  console.log(`[morning-scan] Email sent — Resend ID: ${emailId}`);
}

main().catch(err => {
  console.error('[morning-scan] Fatal:', err.message);
  process.exit(1);
});
