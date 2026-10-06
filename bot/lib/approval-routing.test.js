'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  approvalChannelIdForPacket,
  exclusiveApprovalChannelId,
  paidChannelIdForPacket
} = require('./approval-routing');

test('routes researched approval cards to the standard review channel', () => {
  const env = {
    PICK_APPROVAL_CHANNEL_ID: 'standard-approvals',
    EXCLUSIVE_PICK_APPROVAL_CHANNEL_ID: 'exclusive-approvals'
  };
  assert.equal(approvalChannelIdForPacket({ source: { publish_mode: 'writeup' } }, env), 'standard-approvals');
});

test('routes terms-only X and Telegram exclusives to the exclusive review channel', () => {
  const env = {
    PICK_APPROVAL_CHANNEL_ID: 'standard-approvals',
    EXCLUSIVE_PICK_APPROVAL_CHANNEL_ID: 'exclusive-approvals'
  };
  assert.equal(approvalChannelIdForPacket({ source: { publish_mode: 'terms_only' } }, env), 'exclusive-approvals');
  assert.equal(exclusiveApprovalChannelId(env), 'exclusive-approvals');
});

test('falls back to the standard channel during a staged deployment', () => {
  const env = { PICK_APPROVAL_CHANNEL_ID: 'standard-approvals' };
  assert.equal(approvalChannelIdForPacket({ source: { publish_mode: 'terms_only' } }, env), 'standard-approvals');
  assert.equal(exclusiveApprovalChannelId(env), 'standard-approvals');
});

test('routes NHL approval and paid posts to dedicated hockey channels', () => {
  const env = {
    PICK_APPROVAL_CHANNEL_ID: 'standard-approvals',
    EXCLUSIVE_PICK_APPROVAL_CHANNEL_ID: 'exclusive-approvals',
    HOCKEY_PICK_APPROVAL_CHANNEL_ID: 'hockey-approvals',
    HOCKEY_PICK_CHANNEL_ID: 'hockey-vip',
    EXPERT_PICKS_CHANNEL_ID: 'expert-vip',
    SPORT_CHANNEL_MAP: 'football:football-vip,hockey:old-hockey-vip'
  };
  for (const mode of ['writeup', 'terms_only']) {
    const packet = { source: { publish_mode: mode }, analysis: { extraction: { sport: 'Hockey', league: 'NHL' } } };
    assert.equal(approvalChannelIdForPacket(packet, env), 'hockey-approvals');
    assert.equal(paidChannelIdForPacket(packet, env), 'hockey-vip');
  }
  const football = { source: { publish_mode: 'writeup' }, analysis: { extraction: { league: 'NFL' } } };
  assert.equal(approvalChannelIdForPacket(football, env), 'standard-approvals');
  assert.equal(paidChannelIdForPacket(football, env), 'football-vip');
});
