const {
  assertCompleteWriteup, assertFreePickEligible, assertPublishableExtraction, approvalCopySha256,
  independentWriteupPacket, sourceEvidence, writeupDescription,
} = require('./source-review');
const { fillMissingEvidence } = require('./espn-pick-research');

function isExclusive(packet) {
  return ['terms_only', 'monitored_terms'].includes(packet?.source?.publish_mode);
}

function preparedFreePick(packet) {
  if (!isExclusive(packet) || packet.approval?.free_prepared !== true)
    throw new Error('This exclusive needs a separately reviewed Free Pick breakdown.');
  const independent = independentWriteupPacket(packet);
  assertFreePickEligible(independent);
  assertCompleteWriteup(independent);
  const copy = writeupDescription(independent);
  if (copy !== packet.approval.exact_final_copy
    || approvalCopySha256(copy) !== packet.approval.exact_final_copy_sha256)
    throw new Error('The Free Pick breakdown changed after review. Prepare a new approval card.');
  return independent;
}

async function prepareExclusiveFreePick(packet, { research = fillMissingEvidence } = {}) {
  if (!isExclusive(packet) || packet.approval?.decision)
    throw new Error('Choose a current, unposted exclusive approval card.');
  assertPublishableExtraction(packet);
  const draft = structuredClone(packet);
  const extraction = draft.analysis?.extraction;
  if (!extraction) throw new Error('The exclusive wager has not been verified.');
  // Terms-only source text and media are never presented as an independently
  // researched Free Pick. Start with the verified wager, then collect new facts.
  extraction.source_claims = [];
  extraction.supporting_notes = [];
  if (Array.isArray(extraction.plays))
    extraction.plays = extraction.plays.map(play => ({ ...play, source_claims: [] }));
  delete draft.approval.edited_evidence;
  delete draft.approval.image_url;
  const independent = independentWriteupPacket(draft);
  const result = await research(independent, { allowStatisticalFill: true });
  if (!result.complete || sourceEvidence(independent).length < 4)
    throw new Error(result.reason || 'Independent research did not yield four verified facts for this exclusive. It remains VIP-only.');
  assertFreePickEligible(independent);
  assertCompleteWriteup(independent);
  const copy = writeupDescription(independent);
  draft.approval.free_prepared = true;
  draft.approval.free_prepared_at = new Date().toISOString();
  draft.approval.exact_final_copy = copy;
  draft.approval.exact_final_copy_sha256 = approvalCopySha256(copy);
  preparedFreePick(draft);
  return draft;
}

module.exports = { isExclusive, preparedFreePick, prepareExclusiveFreePick };
