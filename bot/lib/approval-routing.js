'use strict';

function exclusiveApprovalChannelId(env = process.env) {
  return env.EXCLUSIVE_PICK_APPROVAL_CHANNEL_ID || env.PICK_APPROVAL_CHANNEL_ID || '';
}

function isHockeyPacket(packet) {
  const extraction = packet?.analysis?.extraction || {};
  return /\b(?:hockey|nhl)\b/i.test(`${extraction.sport || ''} ${extraction.league || ''}`);
}

function approvalChannelIdForPacket(packet, env = process.env) {
  if (isHockeyPacket(packet) && env.HOCKEY_PICK_APPROVAL_CHANNEL_ID) {
    return env.HOCKEY_PICK_APPROVAL_CHANNEL_ID;
  }
  if (packet?.source?.publish_mode === 'terms_only') {
    return exclusiveApprovalChannelId(env);
  }
  return env.PICK_APPROVAL_CHANNEL_ID || '';
}

function paidChannelIdForPacket(packet, env = process.env) {
  if (isHockeyPacket(packet) && env.HOCKEY_PICK_CHANNEL_ID) return env.HOCKEY_PICK_CHANNEL_ID;
  if (packet?.source?.publish_mode === 'terms_only') {
    return env.EXPERT_PICKS_CHANNEL_ID || env.PUBLISH_CHANNEL_ID || '';
  }
  const extraction = packet?.analysis?.extraction || {};
  const sourceSport = `${extraction.sport || ''} ${extraction.league || ''}`.toLowerCase();
  const sport = /baseball|mlb/.test(sourceSport) ? 'baseball'
    : /football|nfl|ncaaf/.test(sourceSport) ? 'football'
      : /basketball|nba|wnba|ncaab/.test(sourceSport) ? 'basketball'
        : /hockey|nhl/.test(sourceSport) ? 'hockey'
          : /soccer|fifa|mls/.test(sourceSport) ? 'soccer' : '';
  return (env.SPORT_CHANNEL_MAP || '').split(',')
    .map((entry) => entry.trim().split(':'))
    .find(([key, channelId]) => key?.toLowerCase() === sport && channelId)?.[1] || '';
}

module.exports = {
  approvalChannelIdForPacket,
  exclusiveApprovalChannelId,
  isHockeyPacket,
  paidChannelIdForPacket
};
