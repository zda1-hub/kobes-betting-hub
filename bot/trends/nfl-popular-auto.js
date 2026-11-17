'use strict';

// Exact, first-party member requests only. Each NFL leg needs a current quote,
// completed nflverse games, and a fresh game-week roster/injury check.
const fs = require('node:fs/promises');
const path = require('node:path');
const { popularCombos } = require('./combo-ledger');
const { buildPopularCard } = require('./popular');
const { selectEligibleCombo } = require('./nba-popular-auto');
const { currentMarket } = require('./current-market');
const { snapshot: nflSnapshot } = require('./nfl-search');
const { snapshot: contextSnapshot } = require('./nfl-context');
const { seasonFor, exactScheduledGame, findPlayer, verifiedAvailability,
  historicalAnalysis, TEAM_NAMES } = require('./nfl-auto');
const { localParts, TIME_ZONE } = require('./schedule');

async function researchNflComboLeg(leg, { root, oddsKey, now, fetchImpl = fetch,
  readMarket = currentMarket, readNfl = nflSnapshot, readContext = contextSnapshot } = {}) {
  const quote = await readMarket({ root, apiKey: oddsKey, sport: 'NFL',
    team: leg.team, player: leg.player, stat: leg.stat, side: leg.side,
    line: leg.line, now, fetchImpl });
  if (!quote.offers.length) throw new Error('No fresh exact NFL quote');
  const season = seasonFor(now);
  const [current, prior, context] = await Promise.all([
    readNfl({ season, fetchImpl, now: now.valueOf() }),
    readNfl({ season: season - 1, fetchImpl, now: now.valueOf() }),
    readContext({ season, fetchImpl, now: now.valueOf() })
  ]);
  const game = exactScheduledGame(current.scheduleCsv, quote.event);
  const player = findPlayer(current.players, leg.player);
  const rows = context.rosters.filter(row => row.season === String(season) &&
    row.gsis_id === player.id && Number(row.week) === game.week &&
    row.status === 'ACT' && [game.home_team, game.away_team].includes(row.team));
  if (rows.length !== 1) throw new Error('NFL player is not on the event roster');
  const team = rows[0].team;
  const availability = verifiedAvailability(context, { season, week: game.week,
    playerId: player.id, team, now });
  const analysis = historicalAnalysis(current.statsCsv, prior.statsCsv, current.scheduleCsv,
    { season, playerId: player.id, stat: leg.stat, line: leg.line,
      opponent: team === game.home_team ? game.away_team : game.home_team,
      location: team === game.home_team ? 'home' : 'away' });
  if (!Object.hasOwn(TEAM_NAMES, team) || analysis.season.sample < 8 ||
      analysis.l20.sample < 20 || analysis.season.hitRate < 0.8 ||
      analysis.l20.hitRate < 0.8)
    throw new Error('NFL leg lacks completed-game history or 80% descriptive rate');
  return { player: player.name, stat: leg.stat, side: leg.side, line: leg.line,
    eventId: quote.event.id, startsAt: quote.event.commence_time,
    offers: quote.offers, analysis, availability,
    sourceUrl: `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`,
    checkedAt: now.toISOString() };
}

function validatedNflLegs(research, now) {
  const common = research[0].offers.map(row => row.sportsbookKey).filter(Boolean)
    .filter(key => research.every(item => item.offers.some(row => row.sportsbookKey === key)));
  if (!common.length) throw new Error('No one sportsbook quotes every exact NFL leg');
  const sportsbookKey = [...new Set(common)].sort()[0];
  return research.map((row, index) => {
    const offer = row.offers.find(item => item.sportsbookKey === sportsbookKey);
    if (!offer || row.availability.status !== 'active-roster-no-listed-injury')
      throw new Error('NFL leg lacks a current quote or cleared game-week status');
    return { id: String(index), player: row.player, market: `${row.side} ${row.stat}`,
      line: row.line, odds: offer.odds, sportsbook: offer.sportsbook,
      sportsbookKey, available: true, updatedAt: offer.updatedAt,
      gameId: row.eventId, startsAt: row.startsAt,
      recentHits: row.analysis.l20.hits, recentSample: row.analysis.l20.sample,
      seasonHits: row.analysis.season.hits, seasonSample: row.analysis.season.sample,
      analysisSource: row.sourceUrl, analysisCheckedAt: row.checkedAt,
      availabilityVerified: true, availabilityCheckedAt: row.availability.checkedAt };
  });
}

async function scanNflPopular({ root, oddsKey, channelId, channelFor,
  now = new Date(), fetchImpl = fetch, readCombos = popularCombos,
  readEvents, researchLeg = researchNflComboLeg } = {}) {
  if (!root || !oddsKey || !/^\d{17,22}$/.test(String(channelId || '')) ||
      typeof channelFor !== 'function') throw new Error('Private NFL popular destination required');
  const serviceDate = localParts(now, TIME_ZONE).date;
  const file = path.join(root, 'trends-popular', `nfl-${serviceDate}.json`);
  try { return { ...JSON.parse(await fs.readFile(file, 'utf8')), existing: true }; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const measured = await readCombos({ root, now });
  const schedule = await (readEvents || require('./odds-api').events)('NFL', { apiKey: oddsKey, fetchImpl });
  const combo = selectEligibleCombo(measured.combos, schedule.data, now, serviceDate, 'NFL');
  if (!combo) return { status: 'waiting', serviceDate, reason: 'No five-member NFL combination is pregame' };
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const receipt = { version: 1, status: 'reserved', sport: 'NFL', serviceDate,
    comboId: combo.id, channelId, distinctSearchers: combo.distinctSearchers,
    at: now.toISOString() };
  try { await fs.writeFile(file, JSON.stringify(receipt), { mode: 0o600, flag: 'wx' }); }
  catch (error) { if (error.code === 'EEXIST') return { status: 'reserved_elsewhere', serviceDate }; throw error; }
  let outcome;
  try {
    const research = [];
    for (const leg of combo.legs) research.push(await researchLeg(leg, { root, oddsKey, now, fetchImpl }));
    const legs = validatedNflLegs(research, now);
    const card = buildPopularCard({ legs, searchEvidence: {
      source: 'kbh-prop-search', serviceDate, uniqueSearchers: combo.distinctSearchers,
      legIds: legs.map(row => row.id)
    }, serviceDate, now: now.valueOf() });
    const content = `**${card.title} · NFL**\n${card.lines.map((line, i) => `${i + 1}. ${line}`).join('\n')}\n` +
      `${card.evidence}. Exact member requests, not sportsbook-wide popularity. No combined price or probability is claimed.\n` +
      `Data: nflverse (CC BY 4.0)\nResearch only, not a guarantee`;
    if (content.length > 1900) throw new Error('NFL popular card exceeds Discord limit');
    const channel = await channelFor(channelId);
    if (!channel?.isTextBased?.() || channel.id !== channelId)
      throw new Error('Private popular destination unavailable');
    outcome = { ...receipt, status: 'needs_reconciliation' };
    await fs.writeFile(file, JSON.stringify(outcome), { mode: 0o600 });
    const message = await channel.send({ content, allowedMentions: { parse: [] },
      nonce: combo.id.slice(0, 24), enforceNonce: true });
    if (!message?.id) throw new Error('NFL popular send returned no message ID');
    outcome = { ...receipt, status: 'published', messageId: message.id,
      publishedAt: new Date().toISOString() };
  } catch (error) {
    outcome = { ...(outcome || receipt), status: outcome?.status === 'needs_reconciliation' ?
      'needs_reconciliation' : 'held', reason: error.message };
  }
  await fs.writeFile(file, JSON.stringify(outcome, null, 2), { mode: 0o600 });
  return outcome;
}

module.exports = { researchNflComboLeg, validatedNflLegs, scanNflPopular };
