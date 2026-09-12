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
      units: extraction.units,
      event: extraction.event
    }];
  return plays
    .map((play) => ({
      // Source graphics often include the price in both the selection text
      // and the structured odds field. Keep the exact visible terms, but do
      // not make Kobe review a noisy duplicated price such as "-107 -107".
      selection: visible(play.selection, ''),
      playerName: playerNameFromPlay({
        ...play,
        sourceClaims: extraction.source_claims,
        imageSummary: extraction.image_summary
      }),
      event: visible(play.event || extraction.event, ''),
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

function playerNameFromText(text) {
  const nameToken = "(?:[A-Z]{2,}|[A-Z](?:\\.[A-Z])+|[A-Z][a-z'’-]{1,})";
  const match = String(text || '').match(new RegExp(`\\b(${nameToken}(?:\\s+${nameToken}){1,3})\\b`));
  return match
    ? match[1].replace(/\s+(?:Over|Under|Anytime|To|First|Last|Hit|Home|Run|Runs|Points?|Receptions?|Receiving|Rushing|Passing|Strikeouts?|Earned|Hits?|Walks?|Bases?)\b.*$/i, '').trim()
    : '';
}

function playerNameFromPlay(play) {
  const explicit = visible(play?.playerName || play?.player_name, '');
  if (explicit && !/^player$/i.test(explicit)) return explicit;

  // Older saved cards did not have player_name. Preserve cards whose
  // selection already visibly starts with a real-looking full name, but do
  // not guess a name from a bare "Over 5.5 K's" type of market.
  const selection = visible(play?.selection, '');
  const selectionName = playerNameFromText(selection);
  if (selectionName && !/^(?:Over|Under|Anytime|Player|Team|Total|First|Last|To|Hit|Home|Run|Runs|Points?|Receptions?|Receiving|Rushing|Passing|Strikeouts?|Earned|Hits?|Walks?|Bases?)\b/i.test(selectionName)) return selectionName;

  // Some image extractors put the player and team in the play event instead
  // of player_name. Recover only the explicit name before a team marker.
  const event = visible(play?.event, '');
  const eventName = event.match(/^(.+?)\s+[—-]\s+.+(?:\([A-Z]{2,4}\))?$/)?.[1]?.trim() || '';
  if (eventName && playerNameFromText(eventName)) return playerNameFromText(eventName);

  // Older packets sometimes put the name in a source claim while leaving the
  // selection as only "Over" or "Under". Use a claim only when it repeats
  // the visible line/market, never from an unrelated sentence.
  const claims = Array.isArray(play?.sourceClaims) ? play.sourceClaims : [];
  const lineMatches = claims.filter((claim) => play?.line
    && String(claim || '').toLowerCase().includes(String(play.line).toLowerCase())
    && playerNameFromText(claim));
  const marketMatches = claims.filter((claim) => /(?:strikeouts?|earned runs?|hits? allowed|total bases?|receptions?|receiving|rushing|passing|points?|rebounds?|assists?|home runs?)/i.test(String(claim || '')) && playerNameFromText(claim));
  const matchingClaim = lineMatches[0] || (lineMatches.length === 0 && marketMatches.length === 1 ? marketMatches[0] : undefined);
  return matchingClaim ? playerNameFromText(matchingClaim) : '';
}

function publicPlayTerm({ terms, selection, playerName, line, oddsAmerican, event, sourceClaims }) {
  const namedPlayer = playerNameFromPlay({ selection, playerName, line, event, sourceClaims });
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

function requiresNamedPlayer(play) {
  const terms = play?.terms || '';
  if (!isPlayerProp(play)) return false;
  // Team sides/totals can contain words such as points or runs. They are not
  // individual-player props and therefore do not need an athlete name.
  if (/\bteam\b|\bgame\s+total\b|\btotal\s+points\b|\b(?:vs?\.?|@)\b|\//i.test(terms)) return false;
  return true;
}

function hasNamedPlayer(play) {
  return Boolean(playerNameFromPlay(play));
}

function supportContext(packet) {
  const extraction = packet.analysis?.extraction || {};
  const plays = Array.isArray(extraction.plays) && extraction.plays.length
    ? extraction.plays
    : [extraction];
  return [...new Set([
    ...publicPickTerms(packet),
    extraction.event,
    ...plays.map((play) => play?.event)
  ].filter((value) => typeof value === 'string' && value.trim()).map(normalizedText))];
}

function namedPhrases(text) {
  // This is deliberately conservative: only multi-word proper names are used
  // to identify an unrelated player/person. Team names such as Florida State
  // remain valid when they are part of the card's event context.
  return [...String(text || '').matchAll(/\b[A-Z][A-Za-z'’.-]{2,}(?:\s+[A-Z][A-Za-z'’.-]{2,})+\b/g)]
    .map((match) => normalizedText(match[0]))
    .filter(Boolean);
}

function hasUnrelatedNamedEntity(note, packet) {
  const context = supportContext(packet);
  // A generic team/game writeup has no player anchor to compare against. Do
  // not reject its matchup facts merely because they contain a team name.
  const hasPlayer = visiblePlays(packet).some(hasNamedPlayer);
  if (!hasPlayer) return false;
  return namedPhrases(note).some((phrase) => !context.some((anchor) => anchor.includes(phrase) || phrase.includes(anchor)));
}

function looksLikeSelection(note) {
  const normalized = normalizedText(note);
  if (/^[+-]?\d{2,4}(?:\s+[a-z]+)?$/.test(normalized)) return true;

  // A copied betting selection is not a breakdown. Preserve factual lines
  // such as "Over in 5 straight" and "Went over 20 points in 6 games".
  const hasHistoricalContext = /\b(?:in|of|over|last|past|previous|straight|games?|starts?|matchups?|attempts?|season|seasons|rate|average|averaged|allowed|rank(?:ed|s)?|without|since|against)\b/.test(normalized);
  if (/\b(?:to hit|to score|to record|anytime)\b/.test(normalized) && !hasHistoricalContext) return true;
  if (/^(?:[a-z][a-z0-9'’-]*\s+){0,5}(?:over|under)\s+\d/.test(normalized) && !hasHistoricalContext) return true;
  return false;
}

function isUsefulSupport(note, pickTerms, packet) {
  const normalized = normalizedText(note);
  if (!normalized) return false;
  if (/\b(?:pick of the day|play of the day|best bet|easy winner|cash|sweep|lock|banger|bang bang|two leg|2 leg|parlay|lets catch|let s catch|lets go|let s go|winner|profit|payout|refund|power play|ladder|make \d+\s*x|\d+\s*\$?\s*to\s+(?:win|one person)|you(?:'|’)ll love|you gonna love|like the demons|link on post|slide for)\b/.test(normalized)) return false;
  if (/^\d{1,2}\s\d{2}\s*(?:am|pm)?\b/.test(normalized)) return false;
  if (pickTerms.some((term) => normalized === normalizedText(term))) return false;
  if (looksLikeSelection(note)) return false;
  if (hasUnrelatedNamedEntity(note, packet)) return false;
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
    .filter((claim) => isUsefulSupport(claim, pickTerms, packet))
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
      oddsAmerican: typeof play.odds_american === 'string' ? play.odds_american.trim() : '',
      event: typeof play.event === 'string' ? play.event.trim() : '',
      sourceClaims: extraction.source_claims
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
    ...(evidence.length ? ['', ...evidence.map((claim) => `- ${claim}`)] : [])
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
  const plays = visiblePlays(packet);
  if (plays.some(requiresNamedPlayer) && plays.some((play) => requiresNamedPlayer(play) && !hasNamedPlayer(play))) {
    throw new Error('A player prop must show the player’s full name before it can be approved or published.');
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
    embed.description = [sourceCapperName(packet), ...terms.map((term) => `• ${term}`)].join('\n');
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
