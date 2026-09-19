'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  approvalChannelIdForPacket,
  exclusiveApprovalChannelId
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
