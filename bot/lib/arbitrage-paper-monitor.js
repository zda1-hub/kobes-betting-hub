const fs = require('node:fs/promises');
const path = require('node:path');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const DEFAULT_BOOKS = ['draftkings', 'fanduel', 'betmgm'];
const DEFAULT_WINDOWS = ['09:30', '12:30', '16:00'];

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

function alertDescription(opportunity, status = 'LIVE OPPORTUNITY — AWAITING KOBE APPROVAL') {
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

function createArbitragePaperMonitor({ apiKey, reviewChannel, destinationChannel, stateFile, fetchImpl = fetch, now = () => new Date(),
  bookmakers = DEFAULT_BOOKS, windows = DEFAULT_WINDOWS, intervalMinutes = 5, minimumEdgePercent = 2, bankroll = 1000,
  memberPostingEnabled = false, isApprover = () => false }) {
  let timer = null, scanning = false, quotaExhausted = false, state = { scans: [], opportunities: {} };
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
    if (!response.ok) {
      const error = new Error(`Odds feed returned ${response.status}.`);
      error.quotaExhausted = response.status === 401 || response.status === 429;
      throw error;
    }
    const remaining = response.headers.get('x-requests-remaining');
    return { events: await response.json(), remaining, used: response.headers.get('x-requests-used'), quotaExhausted: remaining !== null && Number(remaining) <= 0 };
  };
  const currentOpportunity = async (original) => {
    const { events, quotaExhausted: exhausted } = await fetchOdds();
    if (exhausted) quotaExhausted = true;
    // The configured threshold controls which opportunities are noisy enough
    // to create a new approval card. Once Kobe is reviewing a card, accept any
    // still-positive arbitrage and rebuild the stakes from the newest prices.
    // Reusing the discovery threshold here caused valid cards to expire when
    // a 2.01% edge merely moved to 1.99%, even though both sides still locked
    // a positive return.
    return findArbitrage(events, { minimumEdgePercent: 0, bankroll }).find(item => item.id === original.id) || null;
  };
  const recheck = async (original, message, seconds) => {
    try {
      if (quotaExhausted) return;
      const current = await currentOpportunity(original);
      const record = state.opportunities[original.id];
      if (!record || ['PUBLISHED', 'DRY_RUN_APPROVED', 'REJECTED'].includes(record.status)) return;
      record.rechecks.push({ seconds, checkedAt: now().toISOString(), survived: Boolean(current), edgePercent: current?.edgePercent || null });
      record.status = current ? `SURVIVED_${seconds}S` : `EXPIRED_${seconds}S`;
      await save();
      await message.edit({
        embeds: [{ color: current ? 0xE8A317 : 0x777777, title: 'Arbitrage approval', description: alertDescription(current || original, current ? `STILL AVAILABLE AFTER ${seconds} SECONDS` : `EXPIRED WITHIN ${seconds} SECONDS`) }],
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
      const opportunities = findArbitrage(events, { minimumEdgePercent, bankroll });
      state.scans.push({ scannedAt: now().toISOString(), window, eventCount: events.length, opportunityCount: opportunities.length, remaining, used });
      state.scans = state.scans.slice(-500);
      for (const opportunity of opportunities) {
        const prior = state.opportunities[opportunity.id];
        const priorExpired = prior && String(prior.status || '').startsWith('EXPIRED_');
        if (prior && !priorExpired && Date.parse(opportunity.detectedAt) - Date.parse(prior.detectedAt) < 30 * 60000) continue;
        const message = await reviewChannel.send({
          allowedMentions: { parse: [] },
          embeds: [{ color: 0xFF7900, title: 'Arbitrage approval', description: alertDescription(opportunity) }],
          components: reviewComponents(opportunity.id)
        });
        state.opportunities[opportunity.id] = { ...opportunity, status: 'DETECTED', messageId: message.id, rechecks: [] };
        setTimeout(() => void recheck(opportunity, message, 15), 15000).unref();
        setTimeout(() => void recheck(opportunity, message, 30), 30000).unref();
        setTimeout(() => void recheck(opportunity, message, 60), 60000).unref();
      }
      await save();
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
        for (const [id, record] of Object.entries(state.opportunities)) {
          if (!record?.messageId || ['PUBLISHED', 'DRY_RUN_APPROVED', 'REJECTED'].includes(record.status)) continue;
          try {
            const message = await reviewChannel.messages.fetch(record.messageId);
            await message.edit({
              embeds: [{ color: 0xE8A317, title: 'Arbitrage approval', description: alertDescription(record, 'RECHECK LIVE ODDS & APPROVE') }],
              components: reviewComponents(id)
            });
          } catch (error) {
            console.warn(`Could not restore arbitrage approval card ${record.messageId}:`, error.message);
          }
        }
      }
      const first = await scan();
      timer = setInterval(() => {
        if (quotaExhausted) { clearInterval(timer); timer = null; return; }
        void scan().catch(error => console.error('Arbitrage paper scan needs attention:', error.message));
      }, 60000);
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
        await message.edit({ embeds: [{ color: 0x777777, title: 'Arbitrage approval', description: alertDescription(record, 'REJECTED BY KOBE') }], components: reviewComponents(id, { disabled: true }) });
        return { status: 'REJECTED' };
      }
      const current = await currentOpportunity(record);
      if (!current) {
        record.status = 'EXPIRED_AT_APPROVAL'; record.decidedAt = now().toISOString(); record.decidedBy = userId;
        await save();
        await message.edit({ embeds: [{ color: 0x777777, title: 'Arbitrage approval', description: alertDescription(record, 'CURRENTLY UNAVAILABLE — RECHECK AGAIN IF ODDS MOVE') }], components: reviewComponents(id) });
        return { status: 'EXPIRED_AT_APPROVAL' };
      }
      record.decidedAt = now().toISOString(); record.decidedBy = userId;
      if (!memberPostingEnabled) {
        record.status = 'DRY_RUN_APPROVED';
        await save();
        await message.edit({ embeds: [{ color: 0x2ECC71, title: 'Arbitrage approval', description: alertDescription(current, 'DRY RUN APPROVED — MEMBER POST HELD') }], components: reviewComponents(id, { disabled: true }) });
        return { status: 'DRY_RUN_APPROVED' };
      }
      if (!destinationChannel) throw new Error('The VIP arbitrage destination is not configured.');
      const published = await destinationChannel.send({
        allowedMentions: { parse: [] },
        embeds: [{ color: 0xFF7900, title: 'Arbitrage opportunity', description: alertDescription(current, 'KOBE APPROVED — RECHECK ODDS BEFORE PLACING') }]
      });
      record.status = 'PUBLISHED'; record.publishedAt = now().toISOString(); record.publishedMessageId = published.id;
      await save();
      await message.edit({ embeds: [{ color: 0x2ECC71, title: 'Arbitrage approval', description: alertDescription(current, 'POSTED TO VIP ARBITRAGE') }], components: reviewComponents(id, { disabled: true }) });
      return { status: 'PUBLISHED', messageId: published.id };
    },
    scan,
    snapshot: () => JSON.parse(JSON.stringify(state))
  };
}

module.exports = { activeWindow, alertDescription, createArbitragePaperMonitor, findArbitrage, reviewComponents };
