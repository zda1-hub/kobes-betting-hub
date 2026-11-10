const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomInt } = require('node:crypto');
const { freeRows, verified } = require('./free-pick-results');
const { resultFor } = require('./pick-log');
const { buildResultReply, syncFreePickResultReplies } = require('./free-pick-result-replies');
const { queueApprovedResultStory } = require('./free-pick-result-story');

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 20);
const noMentions = { parse: [] };
const finalStatuses = new Set(['REJECTED', 'X_REQUESTED', 'NEEDS_ATTENTION']);
// Kobe's source list also includes certainty and profit claims such as "FREE
// MONEY FR" and "WE DON'T MISS". Only the reactions below can be used without
// changing the verified result or implying a guaranteed return.
const resultOpeners = Object.freeze({
  W: ['CASHHH', 'ANOTHER ONE', "THAT'S A WINNER", 'CASH THE TICKET', 'ANOTHER FREE ONE', 'WE LOVE WINNERS'],
  L: ['ONTO THE NEXT', "CAN'T WIN EM ALL", 'THAT ONE HURT', 'SHAKE IT OFF', "THAT'S THE GAME", 'RESET AND RELOAD'],
});

function approvalConfig(environment = process.env) {
  if (environment.FREE_PICK_RESULT_APPROVALS_ENABLED !== 'true') return null;
  const reviewChannelId = environment.FREE_PICK_RESULT_REVIEW_CHANNEL_ID || environment.PICK_APPROVAL_CHANNEL_ID;
  const startAt = Date.parse(environment.FREE_PICK_RESULT_APPROVAL_START_AT || '');
  if (!/^\d+$/.test(reviewChannelId || '') || !Number.isFinite(startAt))
    throw new Error('Result approvals require a private review channel and a valid activation timestamp.');
  return { reviewChannelId, startAt };
}

function snapshot(row) {
  return [row.pick_id, row.operating_date, row.selection, row.published_line, row.published_odds_american,
    resultFor(row), row.score_or_outcome, row.result_verified_source, row.result_verified_at];
}

function publicCopy(row, opener = '') {
  if (!verified(row)) throw new Error('This result has not been verified.');
  const introduction = String(opener || '').trim();
  if (introduction.length > 80 || /\b(?:guaranteed?|free money|we don.t miss|never a doubt|lock)\b/i.test(introduction))
    throw new Error('The optional opener is too long or makes an unsupported certainty claim.');
  const body = [introduction, buildResultReply(row)].filter(Boolean).join('\n\n');
  if (body.length > 280) throw new Error('The result reply exceeds X length. Shorten the optional opener.');
  return body;
}

function card(state) {
  const disabled = finalStatuses.has(state.status) || state.status === 'APPROVED_AWAITING_PARENT';
  return { allowedMentions: noMentions, embeds: [{ color: state.status === 'REJECTED' ? 0x777777 : 0xff7900,
    title: `Free Pick result approval · ${state.operatingDate}`,
    description: `${state.copy}\n\nX: ${state.status === 'X_REQUESTED' ? 'reply requested' : state.status === 'REJECTED' ? 'rejected' : state.status === 'NEEDS_ATTENTION' ? 'reply needs attention' : state.status === 'APPROVED_AWAITING_PARENT' ? 'waiting for original post' : 'requires separate approval'}\nInstagram: ${state.instagramStatus === 'QUEUED' ? 'approved Story queued; check delivery receipt' : state.instagramStatus === 'NEEDS_ATTENTION' ? 'queue needs attention' : 'not published'}`,
    footer: { text: `KBH free-result-review ${state.key} ${state.digest} · ${state.status}` } }],
    components: [{ type: 1, components: [
      { type: 2, style: 3, label: 'Approve result', custom_id: `free-result:approve:${state.key}:${state.digest}`, disabled },
      { type: 2, style: 2, label: 'Customize opener', custom_id: `free-result:edit:${state.key}:${state.digest}`, disabled },
      { type: 2, style: 4, label: 'Reject', custom_id: `free-result:reject:${state.key}:${state.digest}`, disabled }
    ] }] };
}

function createFreePickResultApprovals({ root, config, channelFor, rowsFor, freePickChannelId,
  reviewerIds, guildId, environment = process.env, fetchImpl = fetch,
  queueInstagram = queueApprovedResultStory, randomIndex = randomInt }) {
  let tail = Promise.resolve();
  const serialize = fn => {
    const result = tail.then(fn);
    tail = result.catch(() => {});
    return result;
  };
  const file = key => path.join(root, `${key}.json`);
  const rotationFile = path.join(root, 'opener-rotation.json');
  async function nextOpener(row) {
    const grade = resultFor(row);
    const options = resultOpeners[grade];
    if (!options) return '';
    let previous = {};
    try { previous = JSON.parse(await fs.readFile(rotationFile, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const eligible = options.filter(value => value !== previous[grade]);
    const opener = eligible[randomIndex(eligible.length)];
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    await fs.writeFile(`${rotationFile}.tmp`, JSON.stringify({ ...previous, [grade]: opener }), { mode: 0o600 });
    await fs.rename(`${rotationFile}.tmp`, rotationFile);
    return opener;
  }
  async function read(key) {
    if (!/^[a-f0-9]{20}$/.test(key)) throw new Error('Invalid result approval key.');
    try { return JSON.parse(await fs.readFile(file(key), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  async function save(state) {
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    await fs.writeFile(`${file(state.key)}.tmp`, JSON.stringify(state), { mode: 0o600 });
    await fs.rename(`${file(state.key)}.tmp`, file(state.key));
  }
  async function reviewChannel() { return channelFor(config.reviewChannelId); }
  async function updateCard(state) {
    if (!state.messageId) return;
    const channel = await reviewChannel();
    await (await channel.messages.fetch(state.messageId)).edit(card(state));
  }
  async function requestX(state, row) {
    const receipts = await syncFreePickResultReplies([row], freePickChannelId, {
      environment: { ...environment, FREE_PICK_X_RESULT_REPLIES_ENABLED: 'true' }, fetchImpl,
      bodyFor: () => state.copy,
    });
    const receipt = receipts[0];
    if (!receipt) throw new Error('The approved result was not eligible for an X reply.');
    state.xReceipt = receipt;
    state.status = receipt.status === 'awaiting_original_post' ? 'APPROVED_AWAITING_PARENT'
      : receipt.status === 'needs_attention' ? 'NEEDS_ATTENTION' : 'X_REQUESTED';
    await save(state);
    await updateCard(state);
    return receipt;
  }
  async function currentRow(state) {
    const row = freeRows(await rowsFor(), freePickChannelId).find(item => item.pick_id === state.pickId);
    if (!row || !verified(row) || digest(snapshot(row)) !== state.digest)
      throw new Error('The verified result changed. Use a refreshed approval card.');
    return row;
  }
  function authorized({ userId, requestGuildId, channelId }) {
    if (requestGuildId !== guildId || channelId !== config.reviewChannelId || !reviewerIds.has(userId))
      throw new Error('Only Kobe or the KBH owner can approve results in the private result review channel.');
  }
  return {
    async verifyChannel() { await reviewChannel(); return true; },
    scan(rows) { return serialize(async () => {
      const receipts = [];
      for (const row of freeRows(rows, freePickChannelId).filter(item => verified(item)
        && Date.parse(item.result_verified_at) >= config.startAt)) {
        const key = digest(row.pick_id);
        let state = await read(key);
        const rowDigest = digest(snapshot(row));
        if (state?.status === 'APPROVED_AWAITING_PARENT') {
          if (state.digest === rowDigest) receipts.push({ pickId: row.pick_id, ...(await requestX(state, row)) });
          else {
            state.status = 'NEEDS_ATTENTION';
            state.error = 'The verified result changed after approval. No X reply was requested.';
            await save(state);
            await updateCard(state);
            receipts.push({ pickId: row.pick_id, status: state.status, error: state.error });
          }
          continue;
        }
        if (state?.digest === rowDigest && state.messageId) continue;
        if (state && finalStatuses.has(state.status)) continue;
        const opener = await nextOpener(row);
        state = { key, digest: rowDigest, pickId: row.pick_id, operatingDate: row.operating_date,
          copy: publicCopy(row, opener), opener, status: 'AWAITING_APPROVAL', messageId: null };
        await save(state);
        const channel = await reviewChannel();
        const marker = `KBH free-result-review ${key} ${rowDigest}`;
        const recent = await channel.messages.fetch({ limit: 100 });
        const existing = [...recent.values()].find(message => message.author?.id === channel.client.user.id
          && message.embeds?.[0]?.footer?.text?.startsWith(marker));
        if (existing) state.messageId = existing.id;
        else {
          const message = await channel.send({ ...card(state), nonce: rowDigest, enforceNonce: true });
          state.messageId = message.id;
        }
        await save(state);
        receipts.push({ pickId: row.pick_id, status: state.status, messageId: state.messageId });
      }
      return receipts;
    }); },
    beginEdit({ customId, userId, requestGuildId, channelId, messageId }) { return serialize(async () => {
      authorized({ userId, requestGuildId, channelId });
      const match = String(customId).match(/^free-result:edit:([a-f0-9]{20}):([a-f0-9]{20})$/);
      if (!match) throw new Error('Invalid result edit action.');
      const state = await read(match[1]);
      if (!state || state.digest !== match[2] || state.messageId !== messageId || state.status !== 'AWAITING_APPROVAL')
        throw new Error('This result card is stale or already decided.');
      await currentRow(state);
      return { key: state.key, digest: state.digest, opener: state.opener, messageId };
    }); },
    edit({ key, digest: expectedDigest, opener, userId, requestGuildId, channelId, messageId }) { return serialize(async () => {
      authorized({ userId, requestGuildId, channelId });
      const state = await read(key);
      if (!state || state.digest !== expectedDigest || state.messageId !== messageId || state.status !== 'AWAITING_APPROVAL')
        throw new Error('This result card is stale or already decided.');
      const row = await currentRow(state);
      state.copy = publicCopy(row, opener);
      state.opener = String(opener || '').trim();
      await save(state);
      await updateCard(state);
      return state;
    }); },
    decide({ customId, userId, requestGuildId, channelId, messageId }) { return serialize(async () => {
      authorized({ userId, requestGuildId, channelId });
      const match = String(customId).match(/^free-result:(approve|reject):([a-f0-9]{20}):([a-f0-9]{20})$/);
      if (!match) throw new Error('Invalid result decision.');
      const state = await read(match[2]);
      if (!state || state.digest !== match[3] || state.messageId !== messageId || state.status !== 'AWAITING_APPROVAL')
        throw new Error('This result card is stale or already decided.');
      const row = await currentRow(state);
      state.actorId = userId;
      state.decidedAt = new Date().toISOString();
      if (match[1] === 'reject') {
        state.status = 'REJECTED';
        await save(state);
        await updateCard(state);
        return { status: state.status };
      }
      state.status = 'APPROVED_AWAITING_PARENT';
      await save(state); // Approval is durable before any external X request.
      let receipt;
      try { receipt = await requestX(state, row); }
      catch (error) {
        state.status = 'NEEDS_ATTENTION';
        state.error = String(error?.message || error).slice(0, 200);
        await save(state);
      }
      try {
        state.instagramReceipt = await queueInstagram({ row, copy: state.copy, approvedBy: userId,
          resultDigest: state.digest, environment, fetchImpl });
        state.instagramStatus = 'QUEUED';
      } catch (error) {
        state.instagramStatus = 'NEEDS_ATTENTION';
        state.instagramError = String(error?.message || error).slice(0, 200);
      }
      await save(state);
      await updateCard(state);
      return { status: state.status, receipt, instagram: state.instagramStatus, copy: state.copy };
    }); },
  };
}

module.exports = { approvalConfig, publicCopy, createFreePickResultApprovals };
