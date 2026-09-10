const test = require('node:test');
const assert = require('node:assert/strict');
const { assertFreePickEligible, assertPublishableExtraction, buildSourcePickApprovalEmbed, buildSourcePickEmbed, sourceCapperName, sourceTerms } = require('./source-review');

const packet = {
  source: { handle: 'ExampleSource', media_urls: ['https://example.com/pick.png'] },
  approval: { image_url: 'https://example.com/player-photo.png' },
  analysis: {
    status: 'SOURCE_EXTRACTED',
    extraction: {
      is_pick_candidate: true,
      source_capper_name: 'Example Capper',
      selection: 'Jacob Misiorowski OVER',
      player_name: 'Jacob Misiorowski',
      line: '6.5 strikeouts',
      odds_american: '-115',
      units: '1u',
      source_claims: [
        'Cleared 6+ strikeouts in 4 of the last 5 starts',
        'Opponent ranks bottom 10 in strikeout avoidance',
        'Strong recent road form',
        'Pitch count supports the over',
        'Matchup favors strikeouts'
      ],
      plays: [{
        selection: 'Jacob Misiorowski OVER',
        player_name: 'Jacob Misiorowski',
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
  assert.equal(embed.description, 'Jacob Misiorowski OVER 6.5 strikeouts (-115)\nTeam ML (+120)\n\n• Cleared 6+ strikeouts in 4 of the last 5 starts\n• Opponent ranks bottom 10 in strikeout avoidance\n• Strong recent road form\n• Pitch count supports the over\n• Matchup favors strikeouts');
  assert.equal(embed.image.url, 'https://example.com/player-photo.png');
});

test('keeps the approval card identical to the member post except for the source link at the bottom', () => {
  const sourcePost = 'https://x.com/ExampleSource/status/123';
  const approval = buildSourcePickApprovalEmbed({ ...packet, source: { ...packet.source, post_url: sourcePost } }, 'FREE PICK');
  const memberPost = buildSourcePickEmbed(packet, 'FREE PICK');
  assert.equal(approval.description, `${memberPost.description}\n\n[Open original X post](${sourcePost})`);
  assert.equal(memberPost.description.includes('original X post'), false);
});

test('removes duplicated prop text, timestamps, and promotional source claims', () => {
  const embed = buildSourcePickEmbed({
    ...packet,
    analysis: {
      ...packet.analysis,
      extraction: {
        ...packet.analysis.extraction,
        plays: [{ selection: 'Jacob Misiorowski over 17.5 outs', player_name: 'Jacob Misiorowski', line: '17.5', odds_american: '+100', units: '' }],
        source_claims: [
          'MLB Pick of the Day',
          '(7:40PM) Jacob Misiorowski over 17.5 outs +100',
          'Over in 5 straight',
          'Went 18 outs in both games vs. CHC',
          "Let's catch some Ws today"
        ]
      }
    }
  }, 'FREE PICK');
  assert.equal(embed.description, 'Jacob Misiorowski over 17.5 outs (+100)\n\n• Over in 5 straight\n• Went 18 outs in both games vs. CHC');
});

test('keeps factual support while removing research-source labels and raw stat aliases', () => {
  const embed = buildSourcePickEmbed({
    ...packet,
    analysis: {
      ...packet.analysis,
      extraction: {
        ...packet.analysis.extraction,
        plays: [{ selection: 'SMU/Florida State over 53.5 points', player_name: '', line: '53.5', odds_american: '-118', units: '' }],
        source_claims: [],
        supporting_notes: [
          { text: 'SMU averaged 32.23 points per game (Points Per Game PPG = 32.23) in the 2025 season (team cumulative statistics)' },
          { text: 'Florida State averaged 33.00 points per game (Points Per Game = 33.00) in the 2025 season (team cumulative statistics)' },
          { text: 'The matchup is scheduled for Sep. 7, 2026 at Florida State in Tallahassee (SMU’s 2026 schedule lists “at Florida State — Sep 7, Tallahassee, Fla.”)' }
        ]
      }
    }
  }, 'FREE PICK');
  assert.equal(embed.description, 'SMU/Florida State over 53.5 points (-118)\n\n• SMU averaged 32.23 points per game in the 2025 season\n• Florida State averaged 33.00 points per game in the 2025 season\n• The matchup is scheduled for Sep. 7, 2026 at Florida State in Tallahassee');
});

test('formats leaked-capper picks as terms only, without the source image', () => {
  const embed = buildSourcePickEmbed({
    ...packet,
    source: { ...packet.source, publish_mode: 'terms_only' }
  }, 'PAID PICK');
  assert.equal(embed.description, 'Example Capper\nJacob Misiorowski OVER 6.5 strikeouts -115 (1u)\nTeam ML +120');
  assert.equal(embed.image, undefined);
});

test('formats an exclusive approval card as capper, bet, and stated stake only', () => {
  const embed = buildSourcePickEmbed({
    ...packet,
    source: { ...packet.source, publish_mode: 'terms_only' },
    analysis: {
      ...packet.analysis,
      extraction: {
        ...packet.analysis.extraction,
        source_capper_name: '@CAPPERSCASH',
        plays: [{ selection: 'New York Yankees ML -107', player_name: '', line: '-107', odds_american: '-107', units: '80k' }]
      }
    }
  }, 'PAID PICK');
  assert.equal(embed.description, '@CAPPERSCASH\nNew York Yankees ML -107 (80k)');
});

test('uses destination names directly on approval buttons', () => {
  const buttons = require('./source-review').reviewButtons('20260907-001-X', {
    freeLabel: 'Post to #daily-free-play',
    paidLabel: 'Post to #mlb-writeups'
  });
  assert.equal(buttons[0].components[0].label, 'Post to #daily-free-play');
  assert.equal(buttons[0].components[1].label, 'Post to #mlb-writeups');
});

test('does not treat a leaked-source account as the original capper', () => {
  const leakedPacket = {
    ...packet,
    source: { ...packet.source, publish_mode: 'terms_only', display_name: 'Cappers Cash', handle: 'CappersCash_' },
    analysis: {
      ...packet.analysis,
      extraction: { ...packet.analysis.extraction, source_capper_name: '' }
    }
  };
  assert.equal(sourceCapperName(leakedPacket), '');
  assert.throws(() => assertPublishableExtraction(leakedPacket), /original capper/);

  const echoedSource = {
    ...leakedPacket,
    analysis: {
      ...leakedPacket.analysis,
      extraction: { ...leakedPacket.analysis.extraction, source_capper_name: 'Cappers Cash' }
    }
  };
  assert.equal(sourceCapperName(echoedSource), '');
});

test('does not allow unclear capper or non-pick extraction to publish', () => {
  const noCapper = { ...packet, source: {}, analysis: { ...packet.analysis, extraction: { ...packet.analysis.extraction, source_capper_name: '' } } };
  assert.throws(() => assertPublishableExtraction(noCapper), /original capper/);
  assert.throws(() => assertPublishableExtraction({ ...packet, analysis: { ...packet.analysis, extraction: { ...packet.analysis.extraction, is_pick_candidate: false } } }), /not a verified pick candidate/);
  assert.deepEqual(sourceTerms(packet), ['Jacob Misiorowski OVER 6.5 strikeouts -115 (1u)', 'Team ML +120']);
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

test('recognizes NFL player-prop shorthand and does not require units', () => {
  for (const [terms, player_name] of [
    ['Drake Maye Over 25.5 Rushing Yds', 'Drake Maye'],
    ['Cooper Kupp Over 29.5 Receiving Yds', 'Cooper Kupp']
  ]) {
    assert.doesNotThrow(() => assertFreePickEligible({
      ...packet,
      analysis: {
        ...packet.analysis,
        extraction: {
          ...packet.analysis.extraction,
          plays: [{ selection: terms, player_name, line: '', odds_american: '', units: '' }]
        }
      }
    }));
  }
});

test('keeps a regular approval card usable when units and odds are absent', () => {
  const approval = buildSourcePickApprovalEmbed({
    ...packet,
    source: { ...packet.source, post_url: 'https://x.com/ExampleSource/status/456' },
    analysis: {
      ...packet.analysis,
      extraction: {
        ...packet.analysis.extraction,
        plays: [{ selection: 'Patriots-Seahawks UNDER', line: '44.5', odds_american: '', units: '' }],
        source_claims: []
      }
    }
  }, 'NFL PICK');
  assert.equal(approval.description, 'Patriots-Seahawks UNDER 44.5\n\n[Open original X post](https://x.com/ExampleSource/status/456)');
});

test('does not approve a player prop when the player name is absent', () => {
  const unnamedPlayerProp = {
    ...packet,
    analysis: {
      ...packet.analysis,
      extraction: {
        ...packet.analysis.extraction,
        plays: [{ selection: "Over 5.5 K's", player_name: '', line: '5.5 K', odds_american: '-115', units: '' }]
      }
    }
  };
  assert.throws(() => assertFreePickEligible(unnamedPlayerProp), /player’s full name/);
});
