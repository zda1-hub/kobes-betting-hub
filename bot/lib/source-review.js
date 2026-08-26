const { ButtonStyle, ComponentType } = require('discord.js');

function visible(value, fallback = 'Not shown') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function visiblePlays(packet) {
  const extraction = packet.analysis?.extraction || {};
  const plays = Array.isArray(extraction.plays) && extraction.plays.length
    ? extraction.plays
    : [{
      selection: extraction.selection,
      line: extraction.line,
      odds_american: extraction.odds_american,
      units: extraction.units
    }];
  return plays
    .map((play) => ({
      terms: [play.selection, play.line, play.odds_american]
        .filter((value) => typeof value === 'string' && value.trim())
        .join(' '),
      units: visible(play.units, '')
    }))
    .filter((play) => play.terms);
}

function sourceTerms(packet) {
  return visiblePlays(packet).map(({ terms, units }) => `${terms}${units ? ` (${units})` : ''}`);
}

function assertPublishableExtraction(packet) {
  const extraction = packet.analysis?.extraction;
  if (packet.analysis?.status !== 'SOURCE_EXTRACTED' || !extraction?.is_pick_candidate) {
    throw new Error('This source card is not a verified pick candidate. Reject it or finish manual review first.');
  }
  if (!visible(extraction.source_capper_name, '')) {
    throw new Error('The original capper is not clearly visible, so this card cannot be published automatically.');
  }
  if (sourceTerms(packet).length === 0) {
    throw new Error('The play is not clearly visible, so this card cannot be published automatically.');
  }
}

function buildSourcePickEmbed(packet, destinationLabel) {
  assertPublishableExtraction(packet);
  const extraction = packet.analysis.extraction;
  const embed = {
    color: destinationLabel === 'FREE PICK' ? 0x2B90D9 : 0xD4AF37,
    description: [visible(extraction.source_capper_name), ...sourceTerms(packet)].join('\n'),
    timestamp: new Date().toISOString()
  };
  const imageUrl = packet.source?.media_urls?.[0];
  if (imageUrl) embed.image = { url: imageUrl };
  return embed;
}

function reviewButtons(pickId, { testOnly = false } = {}) {
  return [{
    type: ComponentType.ActionRow,
    components: [
      { type: ComponentType.Button, style: ButtonStyle.Success, label: 'Post as Free Pick', custom_id: `source-review:${pickId}:free`, disabled: testOnly },
      { type: ComponentType.Button, style: ButtonStyle.Primary, label: 'Post to Paid Sport', custom_id: `source-review:${pickId}:paid`, disabled: testOnly },
      { type: ComponentType.Button, style: ButtonStyle.Danger, label: 'Reject', custom_id: `source-review:${pickId}:reject` }
    ]
  }];
}

module.exports = { assertPublishableExtraction, buildSourcePickEmbed, reviewButtons, sourceTerms, visiblePlays };
