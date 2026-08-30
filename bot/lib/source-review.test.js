const test = require('node:test');
const assert = require('node:assert/strict');
const { assertFreePickEligible, assertPublishableExtraction, buildSourcePickEmbed, sourceTerms } = require('./source-review');

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
      source_claims: ['Cleared 6+ strikeouts in 4 of the last 5 starts', 'Opponent ranks bottom 10 in strikeout avoidance'],
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

test('formats a writeup source in Kobe’s pick-first layout', () => {
  const embed = buildSourcePickEmbed(packet, 'FREE PICK');
  assert.equal(embed.description, '**Player OVER 6.5 strikeouts -115 (1u)**\n**Team ML +120**\n\n✅ Cleared 6+ strikeouts in 4 of the last 5 starts\n✅ Opponent ranks bottom 10 in strikeout avoidance');
  assert.equal(embed.image, undefined);
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
  const noCapper = { ...packet, source: {}, analysis: { ...packet.analysis, extraction: { ...packet.analysis.extraction, source_capper_name: '' } } };
  assert.throws(() => assertPublishableExtraction(noCapper), /original capper/);
  assert.throws(() => assertPublishableExtraction({ ...packet, analysis: { ...packet.analysis, extraction: { ...packet.analysis.extraction, is_pick_candidate: false } } }), /not a verified pick candidate/);
  assert.deepEqual(sourceTerms(packet), ['Player OVER 6.5 strikeouts -115 (1u)', 'Team ML +120']);
});

test('limits free posts to writeup player props', () => {
  assert.throws(() => assertFreePickEligible(packet), /side, total, moneyline, spread/);
  assert.throws(() => assertFreePickEligible({ ...packet, source: { ...packet.source, publish_mode: 'terms_only' } }), /writeup player props/);
  assert.doesNotThrow(() => assertFreePickEligible({
    ...packet,
    analysis: {
      ...packet.analysis,
      extraction: { ...packet.analysis.extraction, plays: [packet.analysis.extraction.plays[0]] }
    }
  }));
});
