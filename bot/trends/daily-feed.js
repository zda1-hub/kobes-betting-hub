'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const bdl = require('./bdl-nba');
const panel = require('./bulk-panel');
const { STATS } = require('./prop-flow');
const { researchBulk } = require('./bulk-data');
const { snapshot: nflContext, sourceFresh } = require('./nfl-context');
const { seasonFor } = require('./nfl-auto');
const { FOOTER, statLabel } = require('./bulk-report');

function formatEntry(row) {
  const a = row.analysis.l10;
  const values = a.games.map(game => `${game.date.slice(5)} ${game.value}`).join(' · ');
  return `${row.player} - *${row.teamAbbr}* vs ${row.opponentAbbr || 'OPP N/A'}\n` +
    `Over ${row.threshold} ${statLabel(row.sport, row.stat)} · Calc line (no book line)\n` +
    `L10 ${a.hits}/${a.sample} · ${(a.hitRate * 100).toFixed(0)}% · avg ${a.average?.toFixed(1) || 'N/A'}\n` +
    `Games: ${values || 'N/A'}\n` +
    `Opp rank vs ${row.position || 'position N/A'}: ` +
    `${row.rank ? `#${row.rank} of ${row.rankTeams}` : 'N/A'}` +
    (row.dataDate ? ` · through ${row.dataDate}` : '') +
    (row.sport === 'NFL' ? '\nData: nflverse (CC BY 4.0)' : '') +
    (['CFB', 'CBB'].includes(row.sport) ? '\nInjury status not checked' : '');
}
function feedMessages(rows, { test = false } = {}) {
  if (!rows.length) return [];
  const messages = [];
  const heading = test ? '**TEST — NOT A PICK — HOLD FOR REVIEW**\n' : '';
  let current = heading;
  for (const row of rows) {
    const block = formatEntry(row);
    if (block.length + FOOTER.length + 2 > 1900) throw new Error('Trend block exceeds Discord limit');
    const next = current ? `${current}\n\n${block}` : block;
    if (next.length + FOOTER.length + 1 > 1900) {
      messages.push(`${current}\n${FOOTER}`);
      current = heading + block;
    } else current = next;
  }
  if (current) messages.push(`${current}\n${FOOTER}`);
  return messages;
}
function latestByWeek(rows, id) {
  return rows.filter(row => row.gsis_id === id && Number.isInteger(Number(row.week)))
    .sort((a, b) => Number(b.week) - Number(a.week))[0] || null;
}
function fullL10Rows(rows) {
  return rows.filter(row => row.analysis?.l10?.sample === 10);
}
async function filterAvailable(state, { bdlKey, now = new Date(), fetchImpl = fetch }) {
  if (state.sport === 'NBA') {
    const injuries = await bdl.pages('/v1/player_injuries?per_page=100',
      { apiKey: bdlKey, fetchImpl });
    const ruledOut = new Set(injuries.filter(row =>
      /^(out|injured reserve|inactive|suspended|not with team)$/i.test(String(row.status || '').trim()))
      .map(row => String(row.player?.id || row.player_id || '')));
    state.players = state.players.filter(row => !ruledOut.has(row.value));
  } else if (state.sport === 'NFL') {
    const context = await nflContext({ season: seasonFor(now), now: now.valueOf(), fetchImpl });
    if (!sourceFresh(context.injuryUpdatedAt, now.valueOf()))
      throw new Error('NFL injury feed is stale; daily post held');
    state.players = state.players.filter(player => {
      const report = latestByWeek(context.injuries, player.value);
      return !report || !/^(out|ir|injured reserve)$/i.test(String(report.report_status || '').trim());
    });
  }
}
async function prepare({ sport, root, oddsKey, bdlKey, collegeBaseUrl, collegeSecret, threshold = 80,
  now = new Date(), fetchImpl = fetch }) {
  if (!['NBA', 'NFL', 'CFB', 'CBB'].includes(sport) || ![70, 80].includes(threshold))
    throw new Error('Unsupported daily feed configuration');
  const state = panel.start({ ownerId: 'daily-feed', channelId: 'internal', leagues: [sport], now });
  try {
    state.sport = sport;
    await panel.loadTodayTeams(state, { oddsKey, bdlKey, collegeBaseUrl, collegeSecret,
      now, fetchImpl });
    await panel.loadPlayers(state, { bdlKey, collegeBaseUrl, collegeSecret, now, fetchImpl });
    await filterAvailable(state, { bdlKey, now, fetchImpl });
    state.selectedStats = STATS[sport].map(([value]) => value);
    state.window = 'L10';
    const report = await researchBulk(state, { root, bdlKey, now, fetchImpl,
      minimumRate: threshold / 100, requireAny80: false });
    // A 1/1 or 2/2 sample is not the configured L10 8/10+ feed threshold.
    // Private searches still display and label their real smaller denominators.
    const rows = fullL10Rows(report.rows);
    return { date: state.serviceDate, sport, threshold,
      rows, messages: feedMessages(rows) };
  } finally { panel.sessions.delete(state.id); }
}
function receiptPath(root, sport, date) {
  return path.join(root, 'trends', 'daily-feed', `${date}-${sport.toLowerCase()}.json`);
}
async function publish({ root, report, channel, test = false }) {
  if (!report?.messages || !channel?.isTextBased?.()) throw new Error('Verified feed report and channel required');
  const file = receiptPath(root, report.sport, test ? `${report.date}-test` : report.date);
  try {
    const existing = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!test || existing.definitionVersion === 2) return { ...existing, existing: true };
    // Replace the first private proof, which accepted a misleading 1/1 L10
    // sample. Verify ownership and TEST label before deleting exact messages.
    for (const id of existing.messageIds || []) {
      const old = await channel.messages.fetch(id);
      if (old.author?.id !== channel.client.user.id ||
          !old.content?.startsWith('**TEST — NOT A PICK'))
        throw new Error('Old TEST message cannot be safely replaced');
      await old.delete();
    }
    await fs.unlink(file);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!report.messages.length) return { status: 'no_qualifiers', sport: report.sport, date: report.date };
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const reservation = { status: 'reserved', sport: report.sport,
    date: report.date, channelId: channel.id, count: report.rows.length,
    messageIds: [], at: new Date().toISOString(),
    ...(test ? { definitionVersion: 2 } : {}) };
  await fs.writeFile(file, JSON.stringify(reservation), { mode: 0o600, flag: 'wx' });
  const messages = test ? feedMessages(report.rows.slice(0, 1), { test: true }) : report.messages;
  for (const content of messages) {
    const sent = await channel.send({ content, allowedMentions: { parse: [] } });
    reservation.messageIds.push(sent.id);
    reservation.status = 'partial';
    await fs.writeFile(file, JSON.stringify(reservation), { mode: 0o600 });
  }
  reservation.status = test ? 'test_posted' : 'published';
  await fs.writeFile(file, JSON.stringify(reservation), { mode: 0o600 });
  return reservation;
}

module.exports = { formatEntry, feedMessages, fullL10Rows, filterAvailable, prepare, publish,
  receiptPath };
