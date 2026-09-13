const test = require('node:test');
const assert = require('node:assert/strict');
const { assertFreePickEligible, assertPublishableExtraction, buildSourcePickApprovalEmbed, buildSourcePickEmbed, sourceCapperName, sourceEvidence, sourceTerms } = require('./source-review');

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
  assert.equal(embed.description, 'Jacob Misiorowski OVER 6.5 strikeouts (-115)\nTeam ML (+120)\n\n- Cleared 6+ strikeouts in 4 of the last 5 starts\n- Opponent ranks bottom 10 in strikeout avoidance\n- Strong recent road form\n- Pitch count supports the over\n- Matchup favors strikeouts');
  assert.equal(embed.image.url, 'https://example.com/player-photo.png');
});

test('keeps the approval card exactly identical to the member post with no source URL', () => {
  const approval = buildSourcePickApprovalEmbed({ ...packet, source: { ...packet.source, post_url: 'https://x.com/ExampleSource/status/123' } }, 'FREE PICK');
  const memberPost = buildSourcePickEmbed(packet, 'FREE PICK');
  assert.deepEqual(approval, memberPost);
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
  assert.equal(embed.description, 'Jacob Misiorowski over 17.5 outs (+100)\n\n- Over in 5 straight\n- Went 18 outs in both games vs. CHC');
});

test('cleans the exact Bijan production duplication and dangling-link fragment', () => {
  const embed = buildSourcePickEmbed({
    ...packet,
    approval: { image_url: null },
    analysis: {
      ...packet.analysis,
      extraction: {
        ...packet.analysis.extraction,
        event: 'ATL @ PIT',
        market: 'Receiving Yards',
        plays: [{
          selection: 'Bijan Robinson o29.5 Receiving YDs',
          player_name: 'Bijan Robinson',
          line: '29.5 Receiving Yards',
          odds_american: '-140',
          units: '',
          event: 'ATL @ PIT'
        }],
        source_claims: [
          'Bijan Robinson o 29.5 Receiving Yards (-140 DK)',
          'Bijan averaged 48.2 receiving yards per game last season, finishing with 103 targets, 79 catches and 820 yards.',
          'He cleared 29.5 in 12 of 17 games (71%), including 82 yards at https://t.co/example',
          'Avg: 40.7',
          'Median: 38',
          '7 of 10 games 70%'
        ]
      }
    }
  }, 'FREE PICK');
  assert.equal(embed.description, 'Bijan Robinson o29.5 Receiving YDs (-140)\n\n- Bijan averaged 48.2 receiving yards per game last season, finishing with 103 targets, 79 catches and 820 yards\n- He cleared 29.5 in 12 of 17 games (71%)\n- Avg: 40.7\n- Median: 38\n- 7 of 10 games 70%');
});

test('keeps writeup cards to the prop followed by clean relevant bullets', () => {
  const embed = buildSourcePickEmbed({
    ...packet,
    analysis: {
      ...packet.analysis,
      extraction: {
        ...packet.analysis.extraction,
        plays: [{ selection: 'Cooper Kupp Over 2.5 Receptions', player_name: 'Cooper Kupp', line: '2.5 receptions', odds_american: '-132', units: '' }],
        source_claims: [
          '• Kupp has cleared 2+ receptions in 9 of his last 10 games (ESPN)',
          'Opponent allowed 7 receptions to the opposing slot receiver — NFL.com',
          'Source: ESPN',
          'https://example.com/research'
        ]
      }
    }
  }, 'FREE PICK');
  assert.equal(embed.description, 'Cooper Kupp Over 2.5 Receptions (-132)\n\n- Kupp has cleared 2+ receptions in 9 of his last 10 games\n- Opponent allowed 7 receptions to the opposing slot receiver');
});

test('does not include promotional banger wording in a writeup', () => {
  const embed = buildSourcePickEmbed({
    ...packet,
    analysis: {
      ...packet.analysis,
      extraction: {
        ...packet.analysis.extraction,
        plays: [{ selection: 'Cooper Kupp Over 2.5 Receptions', player_name: 'Cooper Kupp', line: '2.5 receptions', odds_american: '-132', units: '' }],
        source_claims: ['NFL 2 banger', 'Kupp has cleared 2+ receptions in 9 of his last 10 games']
      }
    }
  }, 'FREE PICK');
  assert.equal(embed.description, 'Cooper Kupp Over 2.5 Receptions (-132)\n\n- Kupp has cleared 2+ receptions in 9 of his last 10 games');
});

test('does not count promotional copy as regular writeup breakdowns', () => {
  const malformed = {
    ...packet,
    analysis: {
      ...packet.analysis,
      extraction: {
        ...packet.analysis.extraction,
        plays: [{ selection: 'Garrett Mitchell over 7.5 hitter fantasy score', player_name: 'Garrett Mitchell', line: '7.5', odds_american: '', units: '' }],
        source_claims: [
          'Make 620X your money',
          '100$ to one person when this hits',
          'If I like the demons',
          'You gonna love regular',
          '$1 to win $620',
          '6-Pick Power Play',
          'Slide for Refund: $1'
        ]
      }
    }
  };
  assert.deepEqual(sourceEvidence(malformed), []);
});

test('does not use other selections as breakdown bullets', () => {
  const malformed = {
    ...packet,
    analysis: {
      ...packet.analysis,
      extraction: {
        ...packet.analysis.extraction,
        plays: [{ selection: 'Corbin Carroll TO HIT A HOME RUN', player_name: 'Corbin Carroll', line: '', odds_american: '+470', units: '' }],
        source_claims: [
          'Pete Alonso TO Hit a Home Run',
          'Corbin Carroll TO Hit a Home Run',
          'Cal Raleigh TO Hit a Home Run',
          '+7728'
        ]
      }
    }
  };
  assert.deepEqual(sourceEvidence(malformed), []);
});

test('rejects unrelated timeline chatter even when it appears beside a real pick', () => {
  const malformed = {
    ...packet,
    analysis: {
      ...packet.analysis,
      extraction: {
        ...packet.analysis.extraction,
        plays: [{ selection: 'Joey Loperfido - Houston Astros 3-run home run', player_name: 'Joey Loperfido', line: '', odds_american: '+950', units: '' }],
        source_claims: [
          'I just scrolled the entire @mlbhr timeline tonight and found five total parlays that hit',
          'We are officially in the MLB scamball era',
          'It is going to be amazing watching lawsuits against sportsbooks',
          'Pencil pushers, executives, and players are all headed to prison',
          'There is strong evidence that MLB changed the baseballs',
          'Almost every contact-quality Statcast metric has seen an outlier uptick',
          'I am just done with gambling'
        ]
      }
    }
  };
  assert.deepEqual(sourceEvidence(malformed), []);
});

test('rejects copied board headings and other selections from a pick breakdown', () => {
  const malformed = {
    ...packet,
    analysis: {
      ...packet.analysis,
      extraction: {
        ...packet.analysis.extraction,
        plays: [{ selection: 'Michigan State -13.5', player_name: '', line: '-13.5', odds_american: '-178', units: '' }],
        source_claims: ['Spread: Iowa State +14', 'Total: Over 47.5', 'Player Props: PASS', '+12% edge']
      }
    }
  };
  assert.deepEqual(sourceEvidence(malformed), []);
});

test('rejects percentage EV board cells as writeup evidence', () => {
  const malformed = {
    ...packet,
    analysis: { ...packet.analysis, extraction: { ...packet.analysis.extraction,
      plays: [{ selection: 'Tyler Bass Kicking Points Over 7.5', player_name: 'Tyler Bass', line: '7.5', odds_american: '', units: '' }],
      source_claims: ['3% EV', '0% EV', '9% EV', '2% EV']
    } }
  };
  assert.deepEqual(sourceEvidence(malformed), []);
});

test('keeps relevant LeBron-style bullets and removes an unrelated player bullet', () => {
  const writeup = {
    ...packet,
    analysis: {
      ...packet.analysis,
      extraction: {
        ...packet.analysis.extraction,
        plays: [{ selection: 'LeBron James over 22.5 points', player_name: 'LeBron James', line: '22.5 points', odds_american: '', units: '' }],
        event: 'Philadelphia 76ers @ New York Knicks',
        source_claims: [
          'Has over 20 points in 6 straight',
          'Has over 28 points against the Knicks in 6 of 8 matchups',
          'Knicks missing Towns so James should see better interior looks',
          'Embiid is hurt and James has scored over 25 in all games without Embiid',
          'Christian Gonzalez put JSN in a body bag'
        ]
      }
    }
  };
  assert.deepEqual(sourceEvidence(writeup), [
    'Has over 20 points in 6 straight',
    'Has over 28 points against the Knicks in 6 of 8 matchups',
    'Knicks missing Towns so James should see better interior looks',
    'Embiid is hurt and James has scored over 25 in all games without Embiid'
  ]);
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
  assert.equal(embed.description, 'SMU/Florida State over 53.5 points (-118)\n\n- SMU averaged 32.23 points per game in the 2025 season\n- Florida State averaged 33.00 points per game in the 2025 season\n- The matchup is scheduled for Sep. 7, 2026 at Florida State in Tallahassee');
});

test('formats leaked-capper picks as terms only, without the source image', () => {
  const embed = buildSourcePickEmbed({
    ...packet,
    source: { ...packet.source, publish_mode: 'terms_only' }
  }, 'PAID PICK');
  assert.equal(embed.description, 'Example Capper\n• Jacob Misiorowski OVER 6.5 strikeouts -115 (1u)\n• Team ML +120');
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
  assert.equal(embed.description, '@CAPPERSCASH\n• New York Yankees ML -107 (80k)');
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
  assert.equal(approval.description, 'Patriots-Seahawks UNDER 44.5');
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
  assert.throws(() => buildSourcePickEmbed(unnamedPlayerProp, 'PAID PICK'), /player’s full name/);
});

test('keeps an explicitly visible player name when extraction stored it in the event', () => {
  const eventNamed = {
    ...packet,
    analysis: {
      ...packet.analysis,
      extraction: {
        ...packet.analysis.extraction,
        plays: [{
          selection: 'UNDER 1.5 Total Bases',
          player_name: '',
          line: 'UNDER 1.5',
          odds_american: '',
          units: '',
          event: 'Jose Ramirez — Cleveland Guardians (CLE)'
        }],
        source_claims: [
          'Jose Ramirez UNDER 1.5 Total Bases — 10/10 Games',
          'Cleveland has limited opposing production recently',
          'The matchup is scheduled today'
        ]
      }
    }
  };
  assert.equal(buildSourcePickEmbed(eventNamed, 'PAID PICK').description.split('\n')[0], 'Jose Ramirez UNDER 1.5 Total Bases');
});

test('recovers a player name only from a matching visible source claim', () => {
  const claimNamed = {
    ...packet,
    analysis: {
      ...packet.analysis,
      extraction: {
        ...packet.analysis.extraction,
        plays: [{
          selection: 'Over 2.5 Earned Runs',
          player_name: '',
          line: '2.5',
          odds_american: '-124',
          units: '',
          event: 'CIN @ MIL'
        }],
        source_claims: [
          'Brady Singer O 2.5 ER (-124)',
          'Over this line in 8 of his last 10 starts',
          'The matchup is scheduled today'
        ]
      }
    }
  };
  assert.equal(buildSourcePickEmbed(claimNamed, 'PAID PICK').description.split('\n')[0], 'Brady Singer Over 2.5 Earned Runs (-124)');
});

test('does not turn a team side into a fake player name from a source phrase', () => {
  const teamSide = {
    ...packet,
    analysis: {
      ...packet.analysis,
      extraction: {
        ...packet.analysis.extraction,
        plays: [{
          selection: 'Iowa -14',
          player_name: '',
          line: '-14',
          odds_american: '',
          units: '',
          event: 'Iowa State at Iowa'
        }],
        source_claims: ['SPREAD IOWA -14', 'The game is scheduled today', 'Iowa is favored']
      }
    }
  };
  assert.equal(buildSourcePickEmbed(teamSide, 'PAID PICK').description.split('\n')[0], 'Iowa -14');
});

test('holds an unnamed bare prop and a non-pick pass marker', () => {
  const bareProp = {
    ...packet,
    analysis: {
      ...packet.analysis,
      extraction: {
        ...packet.analysis.extraction,
        plays: [{ selection: 'Over', player_name: '', line: '3.5', odds_american: '', units: '', event: 'LAD @ MIA' }],
        market: '',
        source_claims: ['The matchup is scheduled today', 'A valid trend is visible', 'The line is playable']
      }
    }
  };
  assert.throws(() => buildSourcePickEmbed(bareProp, 'PAID PICK'), /player’s full name/);

  const pass = {
    ...bareProp,
    analysis: {
      ...bareProp.analysis,
      extraction: { ...bareProp.analysis.extraction, plays: [{ selection: 'Player Props: PASS', line: '', odds_american: '', units: '', event: 'LAD @ MIA' }] }
    }
  };
  assert.throws(() => buildSourcePickEmbed(pass, 'PAID PICK'), /definitive play/);
});

test('holds stat tables and generic totals that do not show a real market or matchup', () => {
  const statTable = {
    ...packet,
    analysis: { ...packet.analysis, extraction: { ...packet.analysis.extraction, plays: [{ selection: 'Tyler Stephenson PA 5, H 3, BA .600', player_name: 'Tyler Stephenson', line: '', odds_american: '', units: '' }] } }
  };
  assert.throws(() => buildSourcePickEmbed(statTable, 'PAID PICK'), /explicit betting market/);

  const genericTotal = {
    ...packet,
    analysis: { ...packet.analysis, extraction: { ...packet.analysis.extraction, plays: [{ selection: 'OVER 8.5', player_name: '', line: '', odds_american: '', units: '', event: '' }] } }
  };
  assert.throws(() => buildSourcePickEmbed(genericTotal, 'PAID PICK'), /(player’s full name|must show the matchup)/);
});

test('formats a reversed player prop with the player first', () => {
  const reversed = {
    ...packet,
    analysis: { ...packet.analysis, extraction: { ...packet.analysis.extraction, plays: [{ selection: 'Over 17.5 Bryan Woo Outs', player_name: 'Bryan Woo', line: '17.5', odds_american: '-171', units: '' }] } }
  };
  assert.equal(buildSourcePickEmbed(reversed, 'PAID PICK').description.split('\n')[0], 'Bryan Woo Over 17.5 Outs (-171)');
});
