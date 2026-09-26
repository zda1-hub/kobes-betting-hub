const sources = require('../../data/twitter-sources.json');

const trendOnlyHandles = new Set(sources
  .filter((source) => source.enabled && source.monitoring_mode === 'trend_only')
  .map((source) => String(source.handle).toLowerCase()));

function isTrendOnlySource(packet) {
  return trendOnlyHandles.has(String(packet?.source?.handle || '').toLowerCase());
}

module.exports = { isTrendOnlySource };
