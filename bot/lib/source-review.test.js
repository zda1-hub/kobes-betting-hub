const test = require('node:test');
const assert = require('node:assert/strict');
const { assertPublishableExtraction, buildSourcePickEmbed, sourceTerms } = require('./source-review');

const packet = {
  source: { handle: 'ExampleSource', media_urls: ['https://example.com/pick.png'] },
  analysis: {
    status: 'SOURCE_EXTRACTED',
    extraction: {
      is_pick_candidate: true,
      source_capper_name: 'Example Capper',
      selection: 'Player OVER',
      line: '6.5 strikeouts',
      odds_american: '-115',
      units: '1u',
      plays: [{
        selection: 'Player OVER',
        line: '6.5 strikeouts',
        odds_american: '-115',
        units: '1u'
      }, {
        selection: 'Team ML',
        line: '',
        odds_american: '+120',
        units: ''
      }]
    }
  }
};

test('formats an extraction-only source pick without research claims', () => {
  const embed = buildSourcePickEmbed(packet, 'FREE PICK');
  assert.equal(embed.description, 'Example Capper\nPlayer OVER 6.5 strikeouts -115 (1u)\nTeam ML +120');
  assert.equal(embed.image.url, 'https://example.com/pick.png');
});

test('formats leaked-capper picks as terms only, without the source image', () => {
  const embed = buildSourcePickEmbed({
    ...packet,
    source: { ...packet.source, publish_mode: 'terms_only' }
  }, 'PAID PICK');
  assert.equal(embed.description, 'Example Capper\nPlayer OVER 6.5 strikeouts -115 (1u)\nTeam ML +120');
  assert.equal(embed.image, undefined);
});

test('does not allow unclear capper or non-pick extraction to publish', () => {
  assert.throws(() => assertPublishableExtraction({ ...packet, analysis: { ...packet.analysis, extraction: { ...packet.analysis.extraction, source_capper_name: '' } } }), /original capper/);
  assert.throws(() => assertPublishableExtraction({ ...packet, analysis: { ...packet.analysis, extraction: { ...packet.analysis.extraction, is_pick_candidate: false } } }), /not a verified pick candidate/);
  assert.deepEqual(sourceTerms(packet), ['Player OVER 6.5 strikeouts -115 (1u)', 'Team ML +120']);
});
