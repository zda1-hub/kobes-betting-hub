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
      player_name: extraction.player_name,
      line: extraction.line,
      odds_american: extraction.odds_american,
      units: extraction.units
    }];
  return plays
    .map((play) => ({
      // Source graphics often include the price in both the selection text
      // and the structured odds field. Keep the exact visible terms, but do
      // not make Kobe review a noisy duplicated price such as "-107 -107".
      selection: visible(play.selection, ''),
      playerName: visible(play.player_name, ''),
      terms: [...new Set([play.selection, play.line, play.odds_american]
        .filter((value) => typeof value === 'string' && value.trim())
        .map((value) => value.trim())
        .filter((value, index, values) => !values.slice(0, index).some((prior) => normalizedText(prior).includes(normalizedText(value)))))]
        .join(' '),
      units: visible(play.units, '')
    }))
    .filter((play) => play.terms);
}

function normalizedText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim();
}

function playerNameFromPlay(play) {
  const explicit = visible(play?.playerName || play?.player_name, '');
  if (explicit && !/^player$/i.test(explicit)) return explicit;

  // Older saved cards did not have player_name. Preserve cards whose
  // selection already visibly starts with a real-looking full name, but do
  // not guess a name from a bare "Over 5.5 K's" type of market.
  const selection = visible(play?.selection, '');
  const match = selection.match(/^([A-Z][a-z'’-]{1,}(?:\s+[A-Z][a-z'’-]{1,}){1,3})\b/);
  return match ? match[1] : '';
}

function publicPlayTerm({ terms, selection, playerName, line, oddsAmerican }) {
  const namedPlayer = playerNameFromPlay({ selection, playerName });
  const baseSelection = selection || terms || '';
  const base = namedPlayer && !normalizedText(baseSelection).includes(normalizedText(namedPlayer))
    ? `${namedPlayer} ${baseSelection}`.trim()
    : baseSelection;
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
  return /\b(?:strikeouts?|k'?s|walks?(?: allowed)?|hits?|total bases?|rbi|runs?|stolen bases?|outs?|earned runs?|points?|rebounds?|assists?|three[- ]pointers?|threes?|blocks?|steals?|passing\s+(?:yards?|yds?)|rushing\s+(?:yards?|yds?)|receiving\s+(?:yards?|yds?)|receptions?|sacks?|shots?(?: on goal)?|goals?|saves?)\b/i.test(play?.terms || '');
}

function hasNamedPlayer(play) {
  return Boolean(playerNameFromPlay(play));
}

function isUsefulSupport(note, pickTerms) {
  const normalized = normalizedText(note);
  if (!normalized) return false;
  if (/\b(?:pick of the day|play of the day|best bet|easy winner|cash|sweep|lock|lets catch|let s catch|lets go|let s go|winner)\b/.test(normalized)) return false;
  if (/^\d{1,2}\s\d{2}\s*(?:am|pm)?\b/.test(normalized)) return false;
  if (pickTerms.some((term) => normalized === normalizedText(term))) return false;
  return true;
}

function cleanEvidenceClaim(claim) {
  let text = String(claim || '')
    .replace(/\r?\n+/g, ' ')
    .replace(/^(?:\s*(?:[-•*]|\d+[.)])\s*)?✅\s*/, '')
    .replace(/^(?:\s*(?:[-•*]|\d+[.)])\s*)/, '')
    .trim()
    .replace(/[.\s]+$/, '');
  // Supporting research is stored with its source URL for audit, but Kobe's
  // member-facing preview should read like a clean writeup—not like a scraped
  // stat table. Remove parenthetical source labels and raw field aliases while
  // retaining parenthetical facts that are actually part of the claim.
  text = text.replace(/\s*\(([^)]*)\)/g, (whole, contents) => {
    const sourceLabel = /\b(?:team\s+(?:cumulative\s+)?stat(?:istic)?s?|team\s+stats?\s+page|stats?\s+page|schedule(?:\s+lists?)?|scoreboard|standings|box\s+score|espn|official|source|data)\b/i;
    const rawFieldAlias = /\b(?:opponents?\s+)?ppg\s*=|\b[A-Za-z][A-Za-z\s]{2,}\s*=\s*[-+]?\d/;
    return sourceLabel.test(contents) || rawFieldAlias.test(contents) ? '' : whole;
  });
  text = text.replace(/\b(?:according to|per)\s+(?:espn|cbs\s+sports?|nfl\.com|patriots\.com|sports[- ]reference|pro[- ]football[- ]reference|yahoo\s+sports?|fox\s+sports?|bleacher\s+report)\s*,?\s*/ig, '');
  text = text.replace(/\b(?:espn|cbs\s+sports?|nfl\.com|patriots\.com|sports[- ]reference|pro[- ]football[- ]reference|yahoo\s+sports?|fox\s+sports?|bleacher\s+report)\b\s*/ig, '');
  // Source URLs and citation wrappers are audit-only metadata. They must not
  // leak into Kobe's clean writeup bullets, even when a research response
  // returns them inline instead of in its structured source_url field.
  text = text.replace(/\[[^\]]*\]\(https?:\/\/[^)]+\)/ig, '');
  text = text.replace(/https?:\/\/\S+/ig, '');
  text = text.replace(/\s*(?:[-–—|]\s*)?(?:source|reference|citation)\s*:\s*$/i, '');
  text = text.replace(/\s*(?:[-–—|]\s*)?(?:via|from)\s*$/i, '');
  return text.replace(/\s{2,}/g, ' ').replace(/\s+([,:;])/g, '$1').trim().replace(/[.\s·|–—-]+$/, '');
}

function sourceEvidence(packet) {
  const extraction = packet.analysis?.extraction || {};
  const pickTerms = publicPickTerms(packet);
  // Regular writeups may include focused research support. It is cleaned below
  // so the member-facing card contains facts, not source credits or URLs.
  const claims = [
    ...(Array.isArray(extraction.source_claims) ? extraction.source_claims : []),
    ...(Array.isArray(extraction.supporting_notes) ? extraction.supporting_notes.map((note) => note?.text) : [])
  ];
  return [...new Set(claims
    .filter((claim) => typeof claim === 'string' && claim.trim())
    .map(cleanEvidenceClaim)
    .filter(Boolean)
    .filter((claim) => !/https?:\/\//i.test(claim)))]
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
      playerName: typeof play.player_name === 'string' ? play.player_name.trim() : '',
      line: typeof play.line === 'string' ? play.line.trim() : '',
      oddsAmerican: typeof play.odds_american === 'string' ? play.odds_american.trim() : ''
    }))
    .filter(Boolean);
}

function writeupDescription(packet) {
  // This is the single source of truth for regular approval and member posts:
  // exact prop terms first, then a blank line, then only relevant reasons.
  const terms = publicPickTerms(packet);
  const evidence = sourceEvidence(packet);
  return [
    ...terms,
    ...(evidence.length ? ['', ...evidence.map((claim) => `• ${claim}`)] : [])
  ].join('\n');
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
  if (visible(extractedName, '')) {
    const name = extractedName.trim();
    const sourceIdentities = [packet.source?.display_name, packet.source?.handle]
      .filter((value) => visible(value, ''))
      .map(normalizedText);
    // A terms-only monitor/repost account is never a valid substitute for the
    // individual capper. Treat an extraction that merely echoed that account
    // as unidentified rather than displaying misleading attribution.
    if (packet.source?.publish_mode === 'terms_only' && sourceIdentities.includes(normalizedText(name))) return '';
    return name;
  }

  // A leak/repost feed is not the original capper. Its cards must hold rather
  // than falsely crediting the account that surfaced the image.
  if (packet.source?.publish_mode === 'terms_only') return '';

  // Direct writeup sources are the original author, so their configured
  // display name remains an accurate fallback when no separate signature is
  // visible in the post itself.
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
  if (!plays.every(hasNamedPlayer)) {
    throw new Error('A player prop must show the player’s full name before it can be approved or published.');
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
    // Private exclusive cards deliberately mirror the eventual exclusive
    // post: capper name, then exact bets/stakes. No source image, analysis,
    // confidence score, or extra operational wording belongs here.
    embed.description = [sourceCapperName(packet), ...terms].join('\n');
  } else {
    // Kobe's writeup layout: player prop, plain factual bullet points, and an
    // optional approved player image below it.
    embed.description = writeupDescription(packet);
    // Never republish a source post graphic. A player image is optional and
    // must be supplied specifically for this approved publication.
    const imageUrl = packet.approval?.image_url;
    if (imageUrl) embed.image = { url: imageUrl };
  }
  return embed;
}

function buildSourcePickApprovalEmbed(packet, destinationLabel) {
  // The approval card begins with the exact member-facing post. The only
  // private addition is a source link at the bottom, so Kobe can inspect the
  // original without having to parse operational metadata before deciding.
  const embed = buildSourcePickEmbed(packet, destinationLabel);
  const sourceUrl = visible(packet.source?.post_url, '');
  if (!sourceUrl) return embed;
  return {
    ...embed,
    description: `${embed.description}\n\n[Open original X post](${sourceUrl})`.slice(0, 4096)
  };
}

function buttonLabel(value, fallback) {
  const label = visible(value, fallback).replace(/\s+/g, ' ').trim();
  return label.slice(0, 80);
}

function reviewButtons(pickId, { testOnly = false, freeLabel, paidLabel } = {}) {
  return [{
    type: ComponentType.ActionRow,
    components: [
      { type: ComponentType.Button, style: ButtonStyle.Success, label: buttonLabel(freeLabel, 'Post to #daily-free-play'), custom_id: `source-review:${pickId}:free`, disabled: testOnly },
      { type: ComponentType.Button, style: ButtonStyle.Primary, label: buttonLabel(paidLabel, 'Post to paid channel'), custom_id: `source-review:${pickId}:paid`, disabled: testOnly },
      { type: ComponentType.Button, style: ButtonStyle.Danger, label: 'Reject', custom_id: `source-review:${pickId}:reject` }
    ]
  }];
}

module.exports = { assertFreePickEligible, assertPublishableExtraction, buildSourcePickApprovalEmbed, buildSourcePickEmbed, hasNamedPlayer, isPlayerProp, presentationConfidence, publicPickTerms, reviewButtons, sourceCapperName, sourceEvidence, sourceTerms, visiblePlays, writeupDescription };
