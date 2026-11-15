'use strict';

const { PDFParse } = require('pdf-parse');
const { playerNameKey } = require('./player-name');

const REPORT_PAGE = 'https://official.nba.com/nba-injury-report-2026-27-season/';
const PDF_PREFIX = 'https://ak-static.cms.nba.com/referee/injury/';
const REPORT_PATTERN = /https:\/\/ak-static\.cms\.nba\.com\/referee\/injury\/Injury-Report_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})(AM|PM)\.pdf/g;
const USER_AGENT = 'KBH Trends Research/1.0 (+https://kobesbettinghub.com/about)';

function latestReportUrl(html) {
  const matches = [...String(html || '').matchAll(REPORT_PATTERN)];
  if (!matches.length) throw new Error('Official NBA injury-report PDF is unavailable');
  // The official page lists reports in chronological order, including some
  // earlier-day reports. Use the last published PDF, not a guessed URL.
  return matches.at(-1)[0];
}

function statusFromText(text, player) {
  const needle = playerNameKey(player);
  if (needle.length < 3) throw new Error('Full NBA player name required');
  const normalize = value => String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’]/g, "'");
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tokens = normalize(player).trim().split(/\s+/);
  if (tokens.length < 2) throw new Error('Full NBA player name required');
  const names = tokens.slice(1).map((_, index) => {
    const split = index + 1;
    return new RegExp(`(?:^|[^A-Za-z])${escape(tokens.slice(split).join(' '))},\\s*${escape(tokens.slice(0, split).join(' '))}\\s+(Available|Probable|Questionable|Doubtful|Out)\\b`, 'i');
  });
  const statuses = [];
  for (const line of normalize(text || '').split('\n')) {
    const found = names.map(pattern => pattern.exec(line)).find(Boolean);
    if (found) statuses.push(found[1].toLowerCase());
  }
  if (statuses.length !== 1) return { status: 'unknown', reason: statuses.length ? 'ambiguous report entries' : 'not explicitly listed' };
  return statuses[0] === 'available'
    ? { status: 'confirmed-active', reportedStatus: 'Available' }
    : { status: 'unconfirmed', reportedStatus: statuses[0] };
}

async function nbaAvailability({ player, fetchImpl = fetch, now = new Date() }) {
  const page = await fetchImpl(REPORT_PAGE, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(10000) });
  if (!page.ok) throw new Error(`Official NBA report index unavailable (${page.status})`);
  const url = latestReportUrl(await page.text());
  if (!url.startsWith(PDF_PREFIX)) throw new Error('Unexpected NBA report host');
  const response = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Official NBA PDF unavailable (${response.status})`);
  const modifiedAt = Date.parse(response.headers.get('last-modified') || '');
  if (!Number.isFinite(modifiedAt) || modifiedAt > now.valueOf() || now.valueOf() - modifiedAt > 30 * 60_000)
    throw new Error('Official NBA report is stale or undated');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 100 || bytes.length > 5_000_000 || bytes.subarray(0, 4).toString() !== '%PDF')
    throw new Error('Official NBA report is not a valid-sized PDF');
  const parser = new PDFParse({ data: bytes });
  let result;
  try { result = await parser.getText(); }
  finally { await parser.destroy(); }
  if (!/^Injury Report:\s*\d{2}\/\d{2}\/\d{2}/.test(result.text || ''))
    throw new Error('Official NBA report format changed');
  const status = statusFromText(result.text, player);
  return { ...status, sourceUrl: url, checkedAt: now.toISOString(), sourceUpdatedAt: new Date(modifiedAt).toISOString() };
}

module.exports = { REPORT_PAGE, latestReportUrl, statusFromText, nbaAvailability };
