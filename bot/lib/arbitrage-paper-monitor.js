const fs = require('node:fs/promises');
const path = require('node:path');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Keep the first scan within one Odds API bookmaker group (up to ten books).
// These keys cover every currently launched Arizona-licensed sportsbook listed
// in The Odds API's US catalog; availability
// of an individual price still depends on the sport, market, and plan.
const DEFAULT_BOOKS = [
  'draftkings', 'fanduel', 'betmgm', 'betrivers', 'williamhill_us',
  'fanatics', 'ballybet', 'hardrockbet_az', 'espnbet'
];

function arbitrageBookmakers(value) {
  if (!value) return [...DEFAULT_BOOKS];
  const books = [...new Set(String(value).split(',').map(book => book.trim().toLowerCase()).filter(Boolean))];
  if (!books.length || books.length > 10 || books.some(book => !/^[a-z0-9_]+$/.test(book))) {
    throw new Error('ARBITRAGE_BOOKMAKERS must contain 1-10 comma-separated Odds API bookmaker keys.');
  }
  return books;
}
function arbitrageSports(value) {
  if (!value) return ['americanfootball_nfl', 'americanfootball_ncaaf', 'baseball_mlb'];
  const sports = [...new Set(String(value).split(',').map(sport => sport.trim().toLowerCase()).filter(Boolean))];
  if (!sports.length || sports.length > 8 || sports.some(sport => !/^[a-z0-9_]+$/.test(sport))) {
    throw new Error('ARBITRAGE_SPORTS must contain 1-8 comma-separated Odds API sport keys.');
  }
  return sports;
}
const DEFAULT_WINDOWS = ['09:30', '12:30', '16:00'];
const MAX_QUOTE_AGE_MS = 60 * 1000;
const MIN_IMPLIED = 0.90;
const MAX_IMPLIED = 1.02;
const MAX_EDGE_PERCENT = 5;

function minuteOfDay(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]), minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function decimal(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 1 ? number : null;
}

function freshQuote(updatedAt, now) {
  const updated = Date.parse(updatedAt);
  const current = now.getTime();
  return Number.isFinite(updated) && updated <= current + 10_000 && current - updated <= MAX_QUOTE_AGE_MS;
}

function findArbitrage(events, { minimumEdgePercent = 2, bankroll = 1000, freshOnly = false, now = new Date(), rejections = null } = {}) {
  const opportunities = [];
  for (const event of events || []) {
    const reject = (reason, detail = '') => { if (rejections) rejections.push({ eventId: event.id, event: `${event.away_team} @ ${event.home_team}`, reason, detail }); };
    if (!event?.id || !event.away_team || !event.home_team || event.away_team === event.home_team ||
        (freshOnly && !(Date.parse(event.commence_time) > now.getTime()))) {
      reject('wrong_game_or_live_market', 'Missing game identity or game has started');
      continue;
    }
    const prices = new Map();
    let stale = 0, invalidMarket = false;
    for (const book of event.bookmakers || []) {
      const markets = (book.markets || []).filter(item => item.key === 'h2h');
      if (markets.length > 1) { invalidMarket = true; break; }
      const market = markets[0];
      if (!market) continue;
      const outcomes=market.outcomes || [];
      if (outcomes.length !== 2 || outcomes.some(item=>item.point !== undefined && item.point !== null) ||
          new Set(outcomes.map(item=>item.name)).size !== 2 ||
          !outcomes.some(item=>item.name===event.away_team) || !outcomes.some(item=>item.name===event.home_team)) {
        invalidMarket = true; break;
      }
      for (const outcome of outcomes) {
        const price = decimal(outcome.price);
        if (!price) continue;
        // The bookmaker timestamp is deprecated by The Odds API. Use the
        // market quote's timestamp so an older bookmaker value does not hide
        // an otherwise current head-to-head price.
        const updatedAt = market.last_update || book.last_update || null;
        if (freshOnly && !freshQuote(updatedAt, now)) { stale += 1; continue; }
        if (!prices.has(outcome.name)) prices.set(outcome.name, []);
        prices.get(outcome.name).push({ name: outcome.name, price, book: book.key, bookName: book.title, updatedAt,
          eventId:event.id,marketKey:'h2h' });
      }
    }
    if (invalidMarket) { reject('market_mismatch', 'Expected exactly two teams in one full-game h2h market per book'); continue; }
    // The top prices on both sides can come from the same book. Search the
    // remaining cross-book combinations instead of dropping the event.
    if (prices.size !== 2) { if(stale) reject('stale_quote', `Ignored ${stale} quote(s) older than 60 seconds`); continue; }
    const [first, second] = [...prices.values()];
    let sides = null;
    let implied = Infinity;
    for (const left of first) {
      for (const right of second) {
        if (left.book === right.book) continue;
        const candidate = 1 / left.price + 1 / right.price;
        if (candidate < implied) { implied = candidate; sides = [left, right]; }
      }
    }
    if (!sides) { if(stale) reject('stale_quote', `No fresh cross-book pair; ignored ${stale} stale quote(s)`); continue; }
    if (implied < MIN_IMPLIED || implied > MAX_IMPLIED) {
      reject('implied_probability_out_of_range', `Selected sides total ${(implied*100).toFixed(2)}%; allowed 90–102%`);
      continue;
    }
    if (implied >= 1) continue;
    const edgePercent = (1 / implied - 1) * 100;
    if (edgePercent > MAX_EDGE_PERCENT) { reject('edge_over_5_percent', `Selected sides imply ${edgePercent.toFixed(2)}% edge`); continue; }
    if (edgePercent < minimumEdgePercent) continue;
    const commonReturn = bankroll / implied;
    const legs = sides.map(side => ({ ...side, stake: commonReturn / side.price, stakePercent: (1 / side.price) / implied * 100 }));
    opportunities.push({
      id: `${event.id}:h2h`, eventId: event.id, sport: event.sport_title || event.sport_key, sportKey: event.sport_key,
      event: `${event.away_team} @ ${event.home_team}`, commenceTime: event.commence_time,
      detectedAt: now.toISOString(), implied, edgePercent, bankroll, projectedReturn: commonReturn,
      projectedProfit: commonReturn - bankroll, legs
    });
  }
  return opportunities.sort((a, b) => b.edgePercent - a.edgePercent);
}

function money(value) { return `$${Number(value).toFixed(2)}`; }

function isUnknownDiscordChannel(error) {
  return Number(error?.code ?? error?.rawError?.code) === 10003;
}

function freshOpportunity(opportunity, now = new Date()) {
  const start = Date.parse(opportunity.commenceTime);
  if (!Number.isFinite(start) || start <= now.getTime()) return false;
  return opportunity.implied >= MIN_IMPLIED && opportunity.implied <= MAX_IMPLIED && opportunity.edgePercent <= MAX_EDGE_PERCENT &&
    opportunity.legs.length === 2 && opportunity.legs.every(leg => leg.eventId === opportunity.eventId && leg.marketKey === 'h2h' && freshQuote(leg.updatedAt, now));
}

function alertDescription(opportunity, status = 'LIVE OPPORTUNITY — AWAITING KOBE APPROVAL', now = new Date()) {
  return [
    `**${status}**`,
    `**${opportunity.event}** · ${opportunity.sport}`,
    `Projected edge: **${opportunity.edgePercent.toFixed(2)}%**`,
    `Total implied: **${(opportunity.implied * 100).toFixed(2)}%** (selected sides)`,
    `Total example: **${money(opportunity.bankroll)}**`,
    ...opportunity.legs.map((leg, index) => `Bet ${index + 1}: **${leg.stakePercent.toFixed(2)}% — ${money(leg.stake)}** on ${leg.name} at ${leg.bookName} (${leg.price.toFixed(3)})`),
    ...opportunity.legs.map((leg, index) => `Quote ${index + 1} age: **${leg.updatedAt ? `${Math.max(0,Math.round((now.getTime()-Date.parse(leg.updatedAt))/1000))}s` : 'unavailable'}** · ${leg.updatedAt ? `<t:${Math.floor(Date.parse(leg.updatedAt) / 1000)}:R>` : 'timestamp unavailable'}`),
    `Projected return: **${money(opportunity.projectedReturn)}**`,
    `Projected profit: **${money(opportunity.projectedProfit)}**`,
    `Detected: <t:${Math.floor(Date.parse(opportunity.detectedAt) / 1000)}:T>`,
    '',
    'Odds move quickly. Confirm both prices before placing either side; no outcome or profit is guaranteed.'
  ].join('\n');
}

function reviewComponents(opportunityId, { disabled = false } = {}) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`arbitrage-review:approve:${opportunityId}`)
      .setLabel('Approve arbitrage')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`arbitrage-review:reject:${opportunityId}`)
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  )];
}

function arizonaClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', hour12: false, hour: '2-digit', minute: '2-digit' }).formatToParts(now);
  return `${parts.find(part => part.type === 'hour').value}:${parts.find(part => part.type === 'minute').value}`;
}

function activeWindow(now = new Date(), windows = DEFAULT_WINDOWS, durationMinutes = 25) {
  const [hour, minute] = arizonaClock(now).split(':').map(Number);
  const current = hour * 60 + minute;
  return windows.find(value => {
    const [rangeStart, rangeEnd] = String(value).split('-').map(part => part.trim());
    if (rangeEnd) {
      const start = minuteOfDay(rangeStart), end = minuteOfDay(rangeEnd);
      return start !== null && end !== null && current >= start && current < end;
    }
    const [startHour, startMinute] = value.split(':').map(Number);
    const start = startHour * 60 + startMinute;
    return current >= start && current < start + durationMinutes;
  }) || null;
}

function createArbitragePaperMonitor({ apiKey, reviewChannel, destinationChannel, archiveChannel, stateFile, fetchImpl = fetch, now = () => new Date(),
  bookmakers = DEFAULT_BOOKS, sports = ['upcoming'], windows = DEFAULT_WINDOWS, intervalMinutes = 5, minimumEdgePercent = 2, bankroll = 1000,
  memberPostingEnabled = false, isApprover = () => false, log = console.log }) {
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 60) {
    throw new Error('ARBITRAGE_SCAN_INTERVAL_MINUTES must be a whole number from 1 to 60.');
  }
  let timer = null, scanning = false, quotaExhausted = false, archiveAvailable = Boolean(archiveChannel);
  let state = { scans: [], opportunities: {} };
  const save = async () => {
    await fs.mkdir(path.dirname(stateFile), { recursive: true, mode: 0o700 });
    await fs.writeFile(`${stateFile}.tmp`, JSON.stringify(state, null, 2), { mode: 0o600 });
    await fs.rename(`${stateFile}.tmp`, stateFile);
  };
  const load = async () => { try { state = JSON.parse(await fs.readFile(stateFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; } };
  const fetchOdds = async (sportKeys = sports) => {
    const events = new Map();
    let remaining = null, used = null, quotaExhausted = false;
    for (const sport of sportKeys) {
      const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/odds`);
      url.searchParams.set('apiKey', apiKey); url.searchParams.set('regions', 'us'); url.searchParams.set('markets', 'h2h');
      url.searchParams.set('bookmakers', bookmakers.join(',')); url.searchParams.set('oddsFormat', 'decimal'); url.searchParams.set('dateFormat', 'iso');
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) {
        const error = new Error(`Odds feed returned ${response.status} for ${sport}.`);
        error.quotaExhausted = response.status === 401 || response.status === 429;
        throw error;
      }
      remaining = response.headers.get('x-requests-remaining');
      used = response.headers.get('x-requests-used');
      for (const event of await response.json()) events.set(event.id, event);
      if (remaining !== null && Number(remaining) <= 0) { quotaExhausted = true; break; }
    }
    return { events: [...events.values()], remaining, used, quotaExhausted };
  };
  const currentOpportunity = async (original) => {
    const { events, quotaExhausted: exhausted } = await fetchOdds([original.sportKey || 'upcoming']);
    if (exhausted) quotaExhausted = true;
    // A fresh fetch is mandatory before any VIP post. The two approved prices
    // are compared again in decide(); a moved price expires the card.
    return findArbitrage(events, { minimumEdgePercent: 0, bankroll, freshOnly: true, now: now() })
      .find(item => item.id === original.id && freshOpportunity(item, now())) || null;
  };
  const sameQuotes = (original, current) => Boolean(current) && original.eventId===current.eventId &&
    original.event===current.event && original.sportKey===current.sportKey &&
    original.commenceTime===current.commenceTime && original.legs.length===current.legs.length &&
    original.legs.every(leg => current.legs.some(live => live.eventId===leg.eventId && live.marketKey===leg.marketKey &&
      live.book===leg.book && live.name===leg.name && live.price===leg.price));
  const recheck = async (original, message, seconds) => {
    try {
      if (quotaExhausted) return;
      const current = await currentOpportunity(original);
      const record = state.opportunities[original.id];
      if (!record || ['PUBLISHED', 'DRY_RUN_APPROVED', 'REJECTED'].includes(record.status)) return;
      const survived=sameQuotes(original,current) && freshOpportunity(original,now());
      record.rechecks.push({ seconds, checkedAt: now().toISOString(), survived, edgePercent: survived?current.edgePercent:null });
      record.status = survived ? `SURVIVED_${seconds}S` : `EXPIRED_${seconds}S`;
      await save();
      await message.edit({
        embeds: [{ color: survived ? 0xE8A317 : 0x777777, title: 'Arbitrage approval', description: alertDescription(survived?current:original, survived ? `SAME QUOTES AFTER ${seconds} SECONDS` : `QUOTE MOVED OR EXPIRED WITHIN ${seconds} SECONDS`, now()) }],
        // Keep the card actionable. Odds can move back into arbitrage after a
        // scheduled check; Kobe's click always performs a fresh live recheck
        // before anything reaches members.
        components: reviewComponents(original.id)
      });
    } catch (error) {
      if (error.quotaExhausted) quotaExhausted = true;
      console.error('Arbitrage paper recheck needs attention:', error.message);
    }
  };
  const scan = async ({ force = false } = {}) => {
    if (quotaExhausted) return { status: 'QUOTA_EXHAUSTED' };
    if (scanning) return { status: 'BUSY' };
    const window = activeWindow(now(), windows);
    if (!force && !window) return { status: 'OUTSIDE_WINDOW' };
    const last = state.scans.at(-1);
    if (!force && last && Date.parse(now().toISOString()) - Date.parse(last.scannedAt) < intervalMinutes * 60000) return { status: 'TOO_SOON' };
    scanning = true;
    try {
      const { events, remaining, used, quotaExhausted: exhausted } = await fetchOdds();
      if (exhausted) quotaExhausted = true;
      const positive = findArbitrage(events, { minimumEdgePercent: 0, bankroll });
      const aboveThreshold = positive.filter(item => item.edgePercent >= minimumEdgePercent);
      // Select the best *fresh* price on each side independently. A stale top
      // price should not hide a real opportunity between two other books.
      const rejections=[];
      const freshPositive = findArbitrage(events, { minimumEdgePercent: 0, bankroll, freshOnly: true, now: now(), rejections });
      for (const rejection of rejections) log(`Arbitrage rejected: ${JSON.stringify(rejection)}`);
      const opportunities = freshPositive.filter(item => {
        if(item.edgePercent<minimumEdgePercent) return false;
        if(!freshOpportunity(item,now())) {log(`Arbitrage rejected: ${JSON.stringify({eventId:item.eventId,reason:'stale_quote_after_selection'})}`);return false;}
        return true;
      });
      const scanRecord = { scannedAt: now().toISOString(), window, sports, intervalMinutes, eventCount: events.length,
        positiveCount: positive.length, aboveThresholdCount: aboveThreshold.length,
        freshPositiveCount: freshPositive.length,
        opportunityCount: opportunities.length, minimumEdgePercent, bookmakerCount: bookmakers.length,
        coveredBookmakers: [...new Set(events.flatMap(event => (event.bookmakers || []).map(book => book.key)))].sort(),
        remaining, used };
      state.scans.push(scanRecord);
      state.scans = state.scans.slice(-500);
      for (const opportunity of opportunities) {
        const prior = state.opportunities[opportunity.id];
        const priorExpired = prior && String(prior.status || '').startsWith('EXPIRED_');
        if (prior && !priorExpired && Date.parse(opportunity.detectedAt) - Date.parse(prior.detectedAt) < 30 * 60000) continue;
        const message = await reviewChannel.send({
          allowedMentions: { parse: [] },
          embeds: [{ color: 0xFF7900, title: 'Arbitrage approval', description: alertDescription(opportunity, undefined, now()) }],
          components: reviewComponents(opportunity.id)
        });
        state.opportunities[opportunity.id] = { ...opportunity, status: 'DETECTED', messageId: message.id, rechecks: [] };
        setTimeout(() => void recheck(opportunity, message, 15), 15000).unref();
        setTimeout(() => void recheck(opportunity, message, 30), 30000).unref();
        setTimeout(() => void recheck(opportunity, message, 60), 60000).unref();
      }
      if (archiveAvailable) {
        const liveIds = new Set(freshPositive.filter(item => freshOpportunity(item, now())).map(item => item.id));
        const candidate = Object.values(state.opportunities)
          .filter(item => item.status === 'PUBLISHED' && item.approvedSnapshot && !item.archivedAt
            && Date.parse(item.publishedAt) <= now().getTime() - 30 * 60000 && !liveIds.has(item.id))
          .sort((a, b) => b.approvedSnapshot.edgePercent - a.approvedSnapshot.edgePercent)[0];
        if (candidate) {
          const example = candidate.approvedSnapshot;
          try {
            const message = await archiveChannel.send({ allowedMentions: { parse: [] }, embeds: [{ color: 0x65748B,
              title: 'Past arbitrage example — not live',
              description: `${alertDescription(example, 'EXPIRED EXAMPLE — DO NOT PLACE THESE BETS', now())}\n\nThis is a theoretical return if both wagers were accepted at the displayed odds. It is not a verified member profit or settled result. Kobe can post proof of any actual result separately.` }] });
            candidate.archivedAt = now().toISOString();
            candidate.archivedMessageId = message.id;
          } catch (error) {
            if (!isUnknownDiscordChannel(error)) throw error;
            archiveAvailable = false;
            console.warn(`Optional arbitrage archive channel ${archiveChannel.id} no longer exists; live scans will continue.`);
          }
        }
      }
      await save();
      log(`Arbitrage scan: ${JSON.stringify(scanRecord)}`);
      return { status: 'SCANNED', eventCount: events.length, opportunityCount: opportunities.length, remaining, used };
    } catch (error) {
      if (error.quotaExhausted) quotaExhausted = true;
      throw error;
    } finally { scanning = false; }
  };
  return {
    async start() {
      await load();
      // Deploys and earlier monitor versions may leave existing approval
      // cards disabled after a temporary odds move. Restore their controls so
      // Kobe can request a fresh live recheck from the original card.
      if (reviewChannel.messages?.fetch) {
        let removedMissingCards = false;
        for (const [id, record] of Object.entries(state.opportunities)) {
          if (!record?.messageId || ['PUBLISHED', 'DRY_RUN_APPROVED', 'REJECTED'].includes(record.status)) continue;
          try {
            const message = await reviewChannel.messages.fetch(record.messageId);
            await message.edit({
              embeds: [{ color: 0xE8A317, title: 'Arbitrage approval', description: alertDescription(record, 'RECHECK LIVE ODDS & APPROVE', now()) }],
              components: reviewComponents(id)
            });
          } catch (error) {
            if (Number(error.code ?? error.rawError?.code) === 10008) {
              // Discord no longer has this message. Drop its saved reference so
              // restarts do not retry it and a new live quote can get a card.
              delete state.opportunities[id];
              removedMissingCards = true;
              log(`Removed missing arbitrage approval card ${record.messageId} from saved state.`);
            } else {
              console.warn(`Could not restore arbitrage approval card ${record.messageId}:`, error.message);
            }
          }
        }
        if (removedMissingCards) await save();
      }
      const first = await scan();
      timer = setInterval(() => {
        if (quotaExhausted) { clearInterval(timer); timer = null; return; }
        void scan().catch(error => console.error('Arbitrage paper scan needs attention:', error.message));
      }, 10000);
      timer.unref();
      return first;
    },
    async stop() { if (timer) clearInterval(timer); timer = null; await save(); },
    async decide({ customId, userId, guildId, channelId, message }) {
      const match = String(customId).match(/^arbitrage-review:(approve|reject):(.+)$/);
      if (!match) throw new Error('That arbitrage action is invalid.');
      const [, action, id] = match;
      if (guildId !== reviewChannel.guildId || channelId !== reviewChannel.id) throw new Error('Use the private arbitrage approval channel.');
      if (!isApprover({ userId, ownerId: reviewChannel.guild.ownerId })) throw new Error('Only Kobe or an authorized approver can review arbitrage cards.');
      const record = state.opportunities[id];
      if (!record) throw new Error('That arbitrage card is no longer in the active test state.');
      if (['PUBLISHED', 'DRY_RUN_APPROVED', 'REJECTED'].includes(record.status)) return { status: record.status, duplicate: true };
      if (action === 'reject') {
        record.status = 'REJECTED'; record.decidedAt = now().toISOString(); record.decidedBy = userId;
        await save();
        await message.edit({ embeds: [{ color: 0x777777, title: 'Arbitrage approval', description: alertDescription(record, 'REJECTED BY KOBE', now()) }], components: reviewComponents(id, { disabled: true }) });
        return { status: 'REJECTED' };
      }
      const queuedQuotesFresh=freshOpportunity(record,now());
      const current = queuedQuotesFresh ? await currentOpportunity(record) : null;
      if (!queuedQuotesFresh || !sameQuotes(record,current) || !freshOpportunity(current,now())) {
        record.status = 'EXPIRED_AT_APPROVAL'; record.decidedAt = now().toISOString(); record.decidedBy = userId;
        await save();
        log(`Arbitrage rejected before VIP: ${JSON.stringify({id,reason:!queuedQuotesFresh?'queued_quote_older_than_60_seconds':current?'quote_moved_or_stale':'quote_unavailable_or_invalid'})}`);
        await message.edit({ embeds: [{ color: 0x777777, title: 'Arbitrage approval', description: alertDescription(record, 'QUOTE MOVED OR INVALID — NOT POSTED TO VIP', now()) }], components: reviewComponents(id) });
        return { status: 'EXPIRED_AT_APPROVAL' };
      }
      record.decidedAt = now().toISOString(); record.decidedBy = userId;
      if (!memberPostingEnabled) {
        record.status = 'DRY_RUN_APPROVED';
        await save();
        await message.edit({ embeds: [{ color: 0x2ECC71, title: 'Arbitrage approval', description: alertDescription(current, 'DRY RUN APPROVED — MEMBER POST HELD', now()) }], components: reviewComponents(id, { disabled: true }) });
        return { status: 'DRY_RUN_APPROVED' };
      }
      if (!destinationChannel) throw new Error('The VIP arbitrage destination is not configured.');
      const published = await destinationChannel.send({
        allowedMentions: { parse: [] },
        embeds: [{ color: 0xFF7900, title: 'Arbitrage opportunity', description: alertDescription(current, 'KOBE APPROVED — RECHECK ODDS BEFORE PLACING', now()) }]
      });
      record.status = 'PUBLISHED'; record.publishedAt = now().toISOString(); record.publishedMessageId = published.id;
      record.approvedSnapshot = current;
      await save();
      await message.edit({ embeds: [{ color: 0x2ECC71, title: 'Arbitrage approval', description: alertDescription(current, 'POSTED TO VIP ARBITRAGE', now()) }], components: reviewComponents(id, { disabled: true }) });
      return { status: 'PUBLISHED', messageId: published.id };
    },
    scan,
    snapshot: () => JSON.parse(JSON.stringify(state))
  };
}

module.exports = { activeWindow, alertDescription, arbitrageBookmakers, arbitrageSports, createArbitragePaperMonitor, findArbitrage, isUnknownDiscordChannel, reviewComponents };
