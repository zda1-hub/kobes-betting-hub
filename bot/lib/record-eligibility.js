const { isPublishedRow } = require('./recap');

// Confirmed server member: kobe.kingston (Kobe). The bot accounts are distinct.
const KOBE_APPROVER_ID = '1209660006383755265';

function recordEligibility(rows) {
  const eligible = [];
  const excluded = { unpublished: 0, otherApprover: 0, missingApprovalTime: 0, invalidPublicationTime: 0 };
  for (const row of rows) {
    if (!isPublishedRow(row)) { excluded.unpublished++; continue; }
    if (String(row.approver || '').trim() !== KOBE_APPROVER_ID) { excluded.otherApprover++; continue; }
    const approved = Date.parse(row.approved_at || '');
    const published = Date.parse(row.published_at || '');
    if (!Number.isFinite(approved)) { excluded.missingApprovalTime++; continue; }
    if (!Number.isFinite(published) || approved > published) { excluded.invalidPublicationTime++; continue; }
    eligible.push(row);
  }
  return { eligible, excluded };
}

module.exports = { recordEligibility, KOBE_APPROVER_ID };
