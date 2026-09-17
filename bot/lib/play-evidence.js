const crypto = require('node:crypto');

const EVIDENCE_SCOPE_VERSION = 2;
function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function playIdentity(play) {
  return crypto.createHash('sha256').update(JSON.stringify([
    normalize(play.player_name), normalize(play.selection), normalize(play.line), normalize(play.event)
  ])).digest('hex');
}
function mentions(text, name) {
  const anchor = normalize(name);
  return Boolean(anchor && (` ${normalize(text)} `).includes(` ${anchor} `));
}
function ownAnchor(text, play, siblings) {
  const name = String(play.player_name || '').trim();
  if (mentions(text, name)) return true;
  const surname = name.split(/\s+/).filter(token => !/^(?:Jr\.?|Sr\.?|II|III|IV)$/i.test(token)).at(-1);
  return Boolean(surname && siblings.every(other => !mentions(other.player_name, surname)) && mentions(text, surname));
}
function mentionsSibling(text, play, siblings) {
  return siblings.some(other => ownAnchor(text, other, [play, ...siblings.filter(entry => entry !== other)]));
}

// Shared post-level prose is not evidence for every wager. Old packets lack
// attribution, so retain only an explicit, unambiguous player anchor; ESPN can
// fill missing facts after isolation. New per-play claims retain contextual
// pronouns, but repeated unanchored bullets across siblings are refused.
function isolatePlayPacket(packet, play, allPlays = packet.analysis?.extraction?.plays || []) {
  const single = structuredClone(packet);
  const extraction = packet.analysis?.extraction || {};
  const siblings = allPlays.filter(other => playIdentity(other) !== playIdentity(play));
  const scoped = Array.isArray(play.source_claims);
  const claims = scoped ? play.source_claims : (extraction.source_claims || []);
  const siblingClaims = new Set(siblings.flatMap(other => other.source_claims || []).map(normalize));
  const sourceClaims = claims.filter(text => typeof text === 'string'
    && !mentionsSibling(text, play, siblings)
    && (scoped ? (!siblingClaims.has(normalize(text)) || ownAnchor(text, play, siblings)) : ownAnchor(text, play, siblings)));
  // Never inherit parent research. It may be for a different athlete even if
  // the parent event matches. Only notes stored on this precise leg survive.
  const supportingNotes = (Array.isArray(play.supporting_notes) ? play.supporting_notes : [])
    .filter(note => note && typeof note.text === 'string' && !mentionsSibling(note.text, play, siblings));
  const isolatedPlay = { ...structuredClone(play), source_claims: sourceClaims, supporting_notes: supportingNotes };
  single.analysis.extraction = {
    ...extraction, ...isolatedPlay, plays: [isolatedPlay],
    source_claims: sourceClaims, supporting_notes: supportingNotes,
    evidence_scope: { version: EVIDENCE_SCOPE_VERSION, play_identity: playIdentity(play), parent_pick_id: packet.pick_id }
  };
  // An old lock must never authorize a changed or inherited breakdown.
  single.approval = { ...(single.approval || {}) };
  delete single.approval.exact_final_copy;
  delete single.approval.exact_final_copy_sha256;
  return single;
}

function isLegacySplit(packet) {
  const extraction = packet.analysis?.extraction || {};
  const scope = extraction.evidence_scope;
  return /-\d{2}-X$/.test(String(packet.pick_id || ''))
    && (scope?.version !== EVIDENCE_SCOPE_VERSION
      || scope?.play_identity !== playIdentity(extraction.plays?.[0] || extraction));
}
function legacyClaimAllowed(packet, text) {
  const extraction = packet.analysis?.extraction || {};
  const play = extraction.plays?.[0] || extraction;
  // Legacy split cards can contain unanchored Josh Allen prose. No guessing
  // which player a pronoun/team claim belongs to when the source was split.
  return mentions(text, play.player_name || extraction.player_name);
}

module.exports = { EVIDENCE_SCOPE_VERSION, isolatePlayPacket, isLegacySplit, legacyClaimAllowed, playIdentity };
