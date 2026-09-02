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

function normalizedText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim();
}

function publicPlayTerm({ terms, selection, line, oddsAmerican }) {
  const base = selection || terms || '';
  const includesLine = line && normalizedText(base).includes(normalizedText(line));
  return [base, includesLine ? '' : line, oddsAmerican ? `(${oddsAmerican})` : '']
    .filter(Boolean)
    .join(' ');
}

function sourceTerms(packet) {
  return visiblePlays(packet).map(({ terms, units }) => `${terms}${units ? ` (${units})` : ''}`);
}

function isPlayerProp(play) {
  // This deliberately looks at the published play itself rather than at a
  // source caption such as "MLB Play of the Day". A free post must be a
  // player-specific stat market, never a side, moneyline, spread, or total.
  return /\b(?:strikeouts?|walks?(?: allowed)?|hits?|total bases?|rbi|runs?|stolen bases?|outs?|earned runs?|points?|rebounds?|assists?|three[- ]pointers?|threes?|blocks?|steals?|passing yards?|rushing yards?|receiving yards?|receptions?|sacks?|shots?(?: on goal)?|goals?|saves?)\b/i.test(play?.terms || '');
}

function isUsefulSupport(note, pickTerms) {
  const normalized = normalizedText(note);
  if (!normalized) return false;
  if (/\b(?:pick of the day|play of the day|best bet|easy winner|cash|sweep|lock|lets catch|let s catch|lets go|let s go|winner)\b/.test(normalized)) return false;
  if (/^\d{1,2}\s\d{2}\s*(?:am|pm)?\b/.test(normalized)) return false;
  if (pickTerms.some((term) => normalized === normalizedText(term))) return false;
  return true;
}

function sourceEvidence(packet) {
  const extraction = packet.analysis?.extraction || {};
  const pickTerms = publicPickTerms(packet);
  const claims = [
    ...(Array.isArray(extraction.source_claims) ? extraction.source_claims : []),
    ...(Array.isArray(extraction.supporting_notes) ? extraction.supporting_notes.map((note) => note?.text) : [])
  ];
  return [...new Set(claims
    .filter((claim) => typeof claim === 'string' && claim.trim())
    .map((claim) => claim.trim().replace(/^(?:[-•]\s*)?✅\s*/, '').replace(/[.\s]+$/, '')))]
    .filter((claim) => isUsefulSupport(claim, pickTerms))
    .slice(0, 8);
}

function publicPickTerms(packet) {
  const extraction = packet.analysis?.extraction || {};
  const plays = Array.isArray(extraction.plays) && extraction.plays.length
    ? extraction.plays
    : [extraction];
  return plays
    .map((play) => publicPlayTerm({
      selection: typeof play.selection === 'string' ? play.selection.trim() : '',
      line: typeof play.line === 'string' ? play.line.trim() : '',
      oddsAmerican: typeof play.odds_american === 'string' ? play.odds_american.trim() : ''
    }))
    .filter(Boolean);
}

// A consistent display rating for writeups. It is a formatting score based on
// the amount of visible support in the approved source, not a prediction or a
// guarantee of the result.
function presentationConfidence(packet) {
  const evidenceCount = sourceEvidence(packet).length;
  if (evidenceCount >= 6) return 9;
  if (evidenceCount >= 5) return 8.5;
  if (evidenceCount >= 4) return 8;
  if (evidenceCount >= 3) return 7.5;
  return 7;
}

function sourceCapperName(packet) {
  const extractedName = packet.analysis?.extraction?.source_capper_name;
  if (visible(extractedName, '')) return extractedName.trim();

  // Many public pick posts identify the author in the post header rather than
  // inside the image. The configured source account is a factual fallback; it
  // does not invent a separate capper name.
  const displayName = packet.source?.display_name;
  if (visible(displayName, '')) return displayName.trim();
  const handle = packet.source?.handle;
  return visible(handle, '') ? `@${handle.trim()}` : '';
}

function assertPublishableExtraction(packet) {
  const extraction = packet.analysis?.extraction;
  if (packet.analysis?.status !== 'SOURCE_EXTRACTED' || !extraction?.is_pick_candidate) {
    throw new Error('This source card is not a verified pick candidate. Reject it or finish manual review first.');
  }
  if (!sourceCapperName(packet)) {
    throw new Error('The original capper is not clearly visible, so this card cannot be published automatically.');
  }
  if (sourceTerms(packet).length === 0) {
    throw new Error('The play is not clearly visible, so this card cannot be published automatically.');
  }
}

function assertFreePickEligible(packet) {
  if (packet.source?.publish_mode === 'terms_only') {
    throw new Error('Free picks are limited to writeup player props. Send leaked capper cards to #exclusives instead.');
  }
  const plays = visiblePlays(packet);
  if (plays.length === 0 || !plays.every(isPlayerProp)) {
    throw new Error('Free picks are limited to player props. This card includes a side, total, moneyline, spread, or unclear market.');
  }
}

function buildSourcePickEmbed(packet, destinationLabel) {
  assertPublishableExtraction(packet);
  const terms = sourceTerms(packet);
  const termsOnly = packet.source?.publish_mode === 'terms_only';
  const embed = {
    color: destinationLabel === 'FREE PICK' ? 0x2B90D9 : 0xD4AF37
  };

  // Exclusives stay exactly as Kobe requested: capper name, visible bets and
  // units, with no image or added analysis.
  if (termsOnly) {
    embed.description = [sourceCapperName(packet), ...terms].join('\n');
  } else {
    // Kobe's writeup layout: player prop, green-check bullet points, a compact
    // confidence line, and the approved player/source image below it.
    const evidence = sourceEvidence(packet);
    embed.description = [
      ...publicPickTerms(packet),
      ...(evidence.length ? ['', ...evidence.map((claim) => `• ✅ ${claim}`)] : []),
      '',
      `⭐ Confidence: ${presentationConfidence(packet).toFixed(1)}/10`
    ].join('\n');
    // Never republish a source post graphic. A player image is optional and
    // must be supplied specifically for this approved publication.
    const imageUrl = packet.approval?.image_url;
    if (imageUrl) embed.image = { url: imageUrl };
  }
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

module.exports = { assertFreePickEligible, assertPublishableExtraction, buildSourcePickEmbed, isPlayerProp, presentationConfidence, publicPickTerms, reviewButtons, sourceCapperName, sourceEvidence, sourceTerms, visiblePlays };
