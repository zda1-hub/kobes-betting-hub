const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_BOOKS = ['draftkings', 'fanduel', 'betmgm'];
const DEFAULT_WINDOWS = ['09:30', '12:30', '16:00'];

function decimal(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 1 ? number : null;
}

function findArbitrage(events, { minimumEdgePercent = 2, bankroll = 1000 } = {}) {
  const opportunities = [];
  for (const event of events || []) {
    const prices = new Map();
    for (const book of event.bookmakers || []) {
      const market = (book.markets || []).find(item => item.key === 'h2h');
      for (const outcome of market?.outcomes || []) {
        const price = decimal(outcome.price);
        if (!price) continue;
        const prior = prices.get(outcome.name);
        if (!prior || price > prior.price) prices.set(outcome.name, { name: outcome.name, price, book: book.key, bookName: book.title, updatedAt: book.last_update || market.last_update || null });
      }
    }
    const sides = [...prices.values()];
    if (sides.length !== 2 || sides[0].book === sides[1].book) continue;
    const implied = sides.reduce((sum, side) => sum + 1 / side.price, 0);
    if (implied >= 1) continue;
    const edgePercent = (1 / implied - 1) * 100;
    if (edgePercent < minimumEdgePercent) continue;
    const commonReturn = bankroll / implied;
    const legs = sides.map(side => ({ ...side, stake: commonReturn / side.price, stakePercent: (1 / side.price) / implied * 100 }));
    opportunities.push({
      id: `${event.id}:h2h`, eventId: event.id, sport: event.sport_title || event.sport_key,
      event: `${event.away_team} @ ${event.home_team}`, commenceTime: event.commence_time,
      detectedAt: new Date().toISOString(), implied, edgePercent, bankroll, projectedReturn: commonReturn,
      projectedProfit: commonReturn - bankroll, legs
    });
  }
  return opportunities.sort((a, b) => b.edgePercent - a.edgePercent);
}

function money(value) { return `$${Number(value).toFixed(2)}`; }

function alertDescription(opportunity, status = 'PAPER TEST — VERIFYING') {
  return [
    `**${status}**`,
    `**${opportunity.event}** · ${opportunity.sport}`,
    `Projected edge: **${opportunity.edgePercent.toFixed(2)}%**`,
    `Total example: **${money(opportunity.bankroll)}**`,
    ...opportunity.legs.map((leg, index) => `Bet ${index + 1}: **${leg.stakePercent.toFixed(2)}% — ${money(leg.stake)}** on ${leg.name} at ${leg.bookName} (${leg.price.toFixed(3)})`),
    `Projected return: **${money(opportunity.projectedReturn)}**`,
    `Projected profit: **${money(opportunity.projectedProfit)}**`,
    `Detected: <t:${Math.floor(Date.parse(opportunity.detectedAt) / 1000)}:T>`,
    '',
    'Private paper test only. No wager recommendation and no member notification.'
  ].join('\n');
}

function arizonaClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', hour12: false, hour: '2-digit', minute: '2-digit' }).formatToParts(now);
  return `${parts.find(part => part.type === 'hour').value}:${parts.find(part => part.type === 'minute').value}`;
}

function activeWindow(now = new Date(), windows = DEFAULT_WINDOWS, durationMinutes = 25) {
  const [hour, minute] = arizonaClock(now).split(':').map(Number);
  const current = hour * 60 + minute;
  return windows.find(value => {
    const [startHour, startMinute] = value.split(':').map(Number);
    const start = startHour * 60 + startMinute;
    return current >= start && current < start + durationMinutes;
  }) || null;
}

function createArbitragePaperMonitor({ apiKey, channel, stateFile, fetchImpl = fetch, now = () => new Date(),
  bookmakers = DEFAULT_BOOKS, windows = DEFAULT_WINDOWS, intervalMinutes = 5, minimumEdgePercent = 2, bankroll = 1000 }) {
  let timer = null, scanning = false, state = { scans: [], opportunities: {} };
  const save = async () => {
    await fs.mkdir(path.dirname(stateFile), { recursive: true, mode: 0o700 });
    await fs.writeFile(`${stateFile}.tmp`, JSON.stringify(state, null, 2), { mode: 0o600 });
    await fs.rename(`${stateFile}.tmp`, stateFile);
  };
  const load = async () => { try { state = JSON.parse(await fs.readFile(stateFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; } };
  const fetchOdds = async () => {
    const url = new URL('https://api.the-odds-api.com/v4/sports/upcoming/odds');
    url.searchParams.set('apiKey', apiKey); url.searchParams.set('regions', 'us'); url.searchParams.set('markets', 'h2h');
    url.searchParams.set('bookmakers', bookmakers.join(',')); url.searchParams.set('oddsFormat', 'decimal'); url.searchParams.set('dateFormat', 'iso');
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Odds feed returned ${response.status}.`);
    return { events: await response.json(), remaining: response.headers.get('x-requests-remaining'), used: response.headers.get('x-requests-used') };
  };
  const recheck = async (original, message, seconds) => {
    try {
      const { events } = await fetchOdds();
      const current = findArbitrage(events, { minimumEdgePercent, bankroll }).find(item => item.id === original.id);
      const record = state.opportunities[original.id];
      record.rechecks.push({ seconds, checkedAt: now().toISOString(), survived: Boolean(current), edgePercent: current?.edgePercent || null });
      record.status = current ? `SURVIVED_${seconds}S` : `EXPIRED_${seconds}S`;
      await save();
      await message.edit({ embeds: [{ color: current ? 0xE8A317 : 0x777777, title: 'Arbitrage paper test', description: alertDescription(current || original, current ? `STILL AVAILABLE AFTER ${seconds} SECONDS` : `EXPIRED WITHIN ${seconds} SECONDS`) }] });
    } catch (error) { console.error('Arbitrage paper recheck needs attention:', error.message); }
  };
  const scan = async ({ force = false } = {}) => {
    if (scanning) return { status: 'BUSY' };
    const window = activeWindow(now(), windows);
    if (!force && !window) return { status: 'OUTSIDE_WINDOW' };
    const last = state.scans.at(-1);
    if (!force && last && Date.parse(now().toISOString()) - Date.parse(last.scannedAt) < intervalMinutes * 60000) return { status: 'TOO_SOON' };
    scanning = true;
    try {
      const { events, remaining, used } = await fetchOdds();
      const opportunities = findArbitrage(events, { minimumEdgePercent, bankroll });
      state.scans.push({ scannedAt: now().toISOString(), window, eventCount: events.length, opportunityCount: opportunities.length, remaining, used });
      state.scans = state.scans.slice(-500);
      for (const opportunity of opportunities) {
        const prior = state.opportunities[opportunity.id];
        if (prior && Date.parse(opportunity.detectedAt) - Date.parse(prior.detectedAt) < 30 * 60000) continue;
        const message = await channel.send({ allowedMentions: { parse: [] }, embeds: [{ color: 0xFF7900, title: 'Arbitrage paper test', description: alertDescription(opportunity) }] });
        state.opportunities[opportunity.id] = { ...opportunity, status: 'DETECTED', messageId: message.id, rechecks: [] };
        setTimeout(() => void recheck(opportunity, message, 15), 15000).unref();
        setTimeout(() => void recheck(opportunity, message, 30), 30000).unref();
        setTimeout(() => void recheck(opportunity, message, 60), 60000).unref();
      }
      await save();
      return { status: 'SCANNED', eventCount: events.length, opportunityCount: opportunities.length, remaining, used };
    } finally { scanning = false; }
  };
  return {
    async start() { await load(); const first = await scan(); timer = setInterval(() => void scan().catch(error => console.error('Arbitrage paper scan needs attention:', error.message)), 60000); timer.unref(); return first; },
    async stop() { if (timer) clearInterval(timer); timer = null; await save(); },
    scan,
    snapshot: () => JSON.parse(JSON.stringify(state))
  };
}

module.exports = { activeWindow, alertDescription, createArbitragePaperMonitor, findArbitrage };
