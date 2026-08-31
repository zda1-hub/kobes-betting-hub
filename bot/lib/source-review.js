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

function isPlayerProp(play) {
  // This deliberately looks at the published play itself rather than at a
  // source caption such as "MLB Play of the Day". A free post must be a
  // player-specific stat market, never a side, moneyline, spread, or total.
  return /\b(?:strikeouts?|walks?(?: allowed)?|hits?|total bases?|rbi|runs?|stolen bases?|outs?|earned runs?|points?|rebounds?|assists?|three[- ]pointers?|threes?|blocks?|steals?|passing yards?|rushing yards?|receiving yards?|receptions?|sacks?|shots?(?: on goal)?|goals?|saves?)\b/i.test(play?.terms || '');
}

function sourceEvidence(packet) {
  const claims = packet.analysis?.extraction?.source_claims;
  if (!Array.isArray(claims)) return [];
  return claims
    .filter((claim) => typeof claim === 'string' && claim.trim())
    .map((claim) => claim.trim().replace(/^(?:[-•]\s*)?✅\s*/, '').replace(/[.\s]+$/, ''))
    .slice(0, 8);
}

// This is a presentation score, not a promise or win probability. Prefer an
// explicit source score; otherwise base it on the amount of concrete support
// in the approved write-up.
function presentationConfidence(packet) {
  const extracted = Number(packet.analysis?.extraction?.confidence);
  if (Number.isFinite(extracted) && extracted >= 1 && extracted <= 10) return Math.round(extracted);
  const evidenceCount = sourceEvidence(packet).length;
  if (evidenceCount >= 6) return 9;
  if (evidenceCount >= 4) return 8;
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
    color: destinationLabel === 'FREE PICK' ? 0x2B90D9 : 0xD4AF37,
    footer: { text: `Pick ID: ${packet.pick_id} | 21+ | Gambling involves risk.` },
    timestamp: new Date().toISOString()
  };

  // Exclusives stay exactly as Kobe requested: capper name, visible bets and
  // units, with no image or added analysis.
  if (termsOnly) {
    embed.description = [sourceCapperName(packet), ...terms].join('\n');
  } else {
    // This mirrors Kobe's member-facing breakdown layout without pretending the
    // bot independently researched a stat. The bullets are only claims that
    // were visibly present in the approved source post.
    const evidence = sourceEvidence(packet);
    embed.description = [
      ...terms.map((term) => `**${term}**`),
      ...(evidence.length ? ['', ...evidence.map((claim) => `✅ ${claim}`)] : []),
      '',
      `⭐ **Confidence: ${presentationConfidence(packet)}/10**`
    ].join('\n');
    // Free-pick posts are clean text-only cards. They must not reuse the
    // original X graphic; Kobe reviews the source privately before posting.
    if (destinationLabel !== 'FREE PICK') {
      const imageUrl = packet.source?.media_urls?.[0];
      if (imageUrl) embed.image = { url: imageUrl };
    }
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

module.exports = { assertFreePickEligible, assertPublishableExtraction, buildSourcePickEmbed, isPlayerProp, presentationConfidence, reviewButtons, sourceCapperName, sourceEvidence, sourceTerms, visiblePlays };
