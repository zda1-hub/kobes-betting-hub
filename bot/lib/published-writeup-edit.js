const { approvalCopySha256, assertCompleteWriteup, sourceEvidence, writeupDescription } = require('./source-review');

function revisePublishedWriteup(packet, currentDescription, rawFacts, editorId, at = new Date().toISOString()) {
  if (packet.approval?.exact_final_copy !== currentDescription)
    throw new Error('The saved writeup and Discord post do not match. No changes were made.');
  const facts = String(rawFacts || '').split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-•]\s*/, '').trim()).filter(Boolean);
  if (facts.length < 4 || facts.length > 8) throw new Error('Keep 4–8 verified facts, one per line.');
  const revised = { ...packet, approval: { ...packet.approval, edited_evidence: facts } };
  if (sourceEvidence(revised).length !== facts.length)
    throw new Error('A fact was duplicated, unrelated, or included a link, mention, or pick terms. No changes were made.');
  assertCompleteWriteup(revised);
  const copy = writeupDescription(revised);
  if (copy.length > 4000) throw new Error('The revised writeup is too long for one Discord card.');
  if (copy.split('\n\n')[0] !== currentDescription.split('\n\n')[0])
    throw new Error('The wager terms changed. No changes were made.');
  if (copy === currentDescription) return { changed: false, packet, copy };
  const oldDigest = approvalCopySha256(currentDescription);
  revised.approval.exact_final_copy = copy;
  revised.approval.exact_final_copy_sha256 = approvalCopySha256(copy);
  revised.approval.writeup_edits = [...(packet.approval.writeup_edits || []), {
    at, by: editorId, old_sha256: oldDigest,
    new_sha256: revised.approval.exact_final_copy_sha256
  }];
  return { changed: true, packet: revised, copy, oldDigest };
}

module.exports = { revisePublishedWriteup };
