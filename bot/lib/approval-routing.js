'use strict';

function exclusiveApprovalChannelId(env = process.env) {
  return env.EXCLUSIVE_PICK_APPROVAL_CHANNEL_ID || env.PICK_APPROVAL_CHANNEL_ID || '';
}

function approvalChannelIdForPacket(packet, env = process.env) {
  if (packet?.source?.publish_mode === 'terms_only') {
    return exclusiveApprovalChannelId(env);
  }
  return env.PICK_APPROVAL_CHANNEL_ID || '';
}

module.exports = {
  approvalChannelIdForPacket,
  exclusiveApprovalChannelId
};
