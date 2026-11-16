'use strict';

// One disposable proof of the real quote -> nflverse -> Discord path. This
// intentionally bypasses only the publication hit-rate threshold and 90-minute
// window; it never calls the member-facing publisher or leaves a test message.
const fs = require('node:fs/promises');
const path = require('node:path');
const { events, eventAlternateOdds } = require('./odds-api');
const { withOddsBudget } = require('./odds-budget');
const { snapshot: nflSnapshot } = require('./nfl-search');
const { snapshot: contextSnapshot } = require('./nfl-context');
const { seasonFor, exactScheduledGame, candidateOffers, findPlayer,
  verifiedAvailability, historicalAnalysis, TEAM_NAMES, MARKETS, MARKET_STATS } = require('./nfl-auto');
const { renderCandidate } = require('./verified-publisher');
const { localParts, TIME_ZONE } = require('./schedule');

function nearestTestEvent(rows, now) {
  return (rows || []).filter(row => Number.isFinite(Date.parse(row.commence_time)) &&
    Date.parse(row.commence_time) - now.valueOf() >= 15 * 60_000 &&
    Date.parse(row.commence_time) - now.valueOf() <= 24 * 3600_000)
    .sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time))[0] || null;
}

async function collectTestCandidate({ root, apiKey, now = new Date(), fetchImpl = fetch,
  readEvents = events, readOdds = eventAlternateOdds, readNfl = nflSnapshot,
  readContext = contextSnapshot, reserveOdds = withOddsBudget } = {}) {
  const schedule = await readEvents('NFL', { apiKey, fetchImpl });
  const event = nearestTestEvent(schedule.data, now);
  if (!event) throw new Error('No upcoming NFL event within 24 hours');
  const season = seasonFor(now);
  const [current, prior, context] = await Promise.all([
    readNfl({ season, fetchImpl, now: now.valueOf() }),
    readNfl({ season: season - 1, fetchImpl, now: now.valueOf() }),
    readContext({ season, fetchImpl, now: now.valueOf() })
  ]);
  const game = exactScheduledGame(current.scheduleCsv, event);
  const odds = await reserveOdds({ root, apiKey, fetchImpl, now,
    cost: MARKETS.length, operation: () => readOdds('NFL', event.id, { apiKey, fetchImpl }) });
  const offers = candidateOffers(odds.selections, now);
  const candidates = [];
  for (const offer of offers) {
    try {
      const player = findPlayer(current.players, offer.player);
      const roster = context.rosters.filter(row => row.season === String(season) &&
        row.gsis_id === player.id && Number(row.week) === game.week && row.status === 'ACT' &&
        [game.home_team, game.away_team].includes(row.team));
      if (roster.length !== 1) continue;
      const team = roster[0].team;
      const availability = verifiedAvailability(context, { season, week: game.week,
        playerId: player.id, team, now });
      const stat = MARKET_STATS[offer.market];
      const analysis = historicalAnalysis(current.statsCsv, prior.statsCsv, current.scheduleCsv,
        { season, playerId: player.id, stat, line: offer.line,
          opponent: team === game.home_team ? game.away_team : game.home_team,
          location: team === game.home_team ? 'home' : 'away' });
      if (analysis.season.sample < 1 || analysis.l20.sample < 1) continue;
      candidates.push({ player: player.name, playerId: player.id, availability, analysis,
        analysisSource: `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`,
        prop: { ...offer, sport: 'NFL', stat, side: 'over', eventId: event.id,
          teamId: TEAM_NAMES[team],
          opponentId: TEAM_NAMES[team === game.home_team ? game.away_team : game.home_team],
          location: team === game.home_team ? 'home' : 'away', startsAt: event.commence_time } });
    } catch { /* Keep only exact current-player evidence. */ }
  }
  candidates.sort((a, b) => b.analysis.season.hitRate - a.analysis.season.hitRate ||
    b.analysis.l20.hitRate - a.analysis.l20.hitRate ||
    b.analysis.l20.sample - a.analysis.l20.sample);
  if (!candidates.length) throw new Error('No NFL player has a fresh quote, roster and injury check, and completed-game log');
  return candidates[0];
}

async function runNflTestProof({ root, apiKey, channelId, channelFor,
  now = new Date(), collect = collectTestCandidate } = {}) {
  if (!root || !apiKey || !/^\d{17,22}$/.test(String(channelId || '')) ||
      typeof channelFor !== 'function') throw new Error('NFL test needs a private test channel');
  const file = path.join(root, 'trends-test', `${localParts(now, TIME_ZONE).date}.json`);
  try { return { ...JSON.parse(await fs.readFile(file, 'utf8')), existing: true }; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const candidate = await collect({ root, apiKey, now });
  const channel = await channelFor(channelId);
  if (!channel?.isTextBased?.() || channel.id !== channelId)
    throw new Error('Private test destination unavailable');
  const content = `**TEST — NOT A PICK — DISPOSABLE**\n` +
    renderCandidate(candidate, localParts(now, TIME_ZONE).date);
  if (content.length > 1900) throw new Error('NFL test card exceeds Discord limit');
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const receipt = { status: 'reserved', channelId, eventId: candidate.prop.eventId,
    player: candidate.player, market: candidate.prop.market, line: candidate.prop.line,
    season: candidate.analysis.season, l20: candidate.analysis.l20,
    quoteUpdatedAt: candidate.prop.updatedAt, at: now.toISOString() };
  await fs.writeFile(file, JSON.stringify(receipt), { mode: 0o600, flag: 'wx' });
  let message;
  try {
    message = await channel.send({ content, allowedMentions: { parse: [] } });
    if (!message?.id) throw new Error('Test send returned no Discord message ID');
    await fs.writeFile(file, JSON.stringify({ ...receipt, status: 'sent', messageId: message.id }), { mode: 0o600 });
    const observed = await channel.messages.fetch(message.id);
    if (observed?.content !== content) throw new Error('Test message content could not be verified');
    await message.delete();
    let deleted = false;
    try { await channel.messages.fetch(message.id); }
    catch (error) { deleted = error.code === 10008 || error.status === 404; }
    if (!deleted) throw new Error('Test message deletion was not verified');
    const outcome = { ...receipt, status: 'verified_deleted', messageId: message.id,
      deletedAt: new Date().toISOString() };
    await fs.writeFile(file, JSON.stringify(outcome, null, 2), { mode: 0o600 });
    return outcome;
  } catch (error) {
    const outcome = { ...receipt, status: message?.id ? 'needs_cleanup' : 'needs_reconciliation',
      messageId: message?.id || null, reason: error.message };
    await fs.writeFile(file, JSON.stringify(outcome, null, 2), { mode: 0o600 });
    return outcome;
  }
}

module.exports = { nearestTestEvent, collectTestCandidate, runNflTestProof };
