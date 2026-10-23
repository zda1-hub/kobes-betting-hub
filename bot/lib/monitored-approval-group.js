'use strict';

const { assertPublishableExtraction } = require('./source-review');

function monitoredCapperKey(packet) {
  if (packet?.source?.publish_mode !== 'monitored_terms'
    || packet.source?.platform !== 'Twitter/X') return '';
  return String(packet.source.handle || '').trim().replace(/^@/, '').toLowerCase();
}

function mergeMonitoredApprovalPackets(packets) {
  if (!Array.isArray(packets) || packets.length < 2) throw new Error('At least two monitored approval packets are required.');
  const ordered = [...packets].sort((a, b) => String(a.pick_id).localeCompare(String(b.pick_id)));
  const key = monitoredCapperKey(ordered[0]);
  if (!key || ordered.some(packet => monitoredCapperKey(packet) !== key || packet.approval?.decision)) {
    throw new Error('Only pending monitored X picks from one capper can share an approval.');
  }
  const merged = structuredClone(ordered[0]);
  const plays = [];
  const seen = new Set();
  const postIds = new Set();
  const postUrls = new Set();
  const pickIds = new Set();
  const starts = [];
  for (const packet of ordered) {
    assertPublishableExtraction(packet);
    pickIds.add(packet.pick_id);
    for (const id of packet.source.grouped_pick_ids || []) if (id) pickIds.add(String(id));
    for (const id of [...(packet.source.post_ids || []), packet.source.post_id]) if (id) postIds.add(String(id));
    for (const url of [...(packet.source.post_urls || []), packet.source.post_url]) if (url) postUrls.add(String(url));
    const start = Date.parse(packet.verification?.event_start || '');
    if (Number.isFinite(start)) starts.push(start);
    const extraction = packet.analysis?.extraction || {};
    const candidates = Array.isArray(extraction.plays) && extraction.plays.length ? extraction.plays : [extraction];
    for (const play of candidates) {
      const odds = String(play.odds_american ?? '').trim();
      if (odds && (!/^[+-]\d{2,4}$/.test(odds) || Number(odds) <= -200)) {
        throw new Error('Stated odds must be strictly better than -200.');
      }
      const identity = `${String(play.selection || '').trim().toLowerCase()}|${String(play.odds_american || '').trim()}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      plays.push({ ...structuredClone(play), event: play.event || extraction.event || '',
        source_post_id: play.source_post_id || packet.source.post_id || '' });
    }
  }
  merged.analysis.extraction.plays = plays;
  // Each leg has its own verified event. A parent's first event must not be
  // inherited by a different player's wager during publication checks.
  merged.analysis.extraction.event = '';
  merged.source.post_ids = [...postIds];
  merged.source.post_urls = [...postUrls];
  merged.source.grouped_pick_ids = [...pickIds];
  merged.approval.image_url = null;
  if (starts.length) merged.verification.event_start = new Date(Math.min(...starts)).toISOString();
  assertPublishableExtraction(merged);
  return merged;
}

module.exports = { mergeMonitoredApprovalPackets, monitoredCapperKey };
