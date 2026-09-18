const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { buildCapperRecap } = require('./capper-recap');
const { splitRecapBody } = require('./recap-review');
const { isPublishedRow } = require('./recap');

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const noMentions = { parse: [] };
const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date);

function recapApprovalGroups({ date, rows, sourceChannelIds }) {
  if (!validDate(date)) throw new Error('Invalid recap date.');
  const selected = rows.filter(row => row.operating_date === date && isPublishedRow(row)
    && sourceChannelIds.includes(String(row.post_reference).match(/^https:\/\/discord\.com\/channels\/\d+\/(\d+)\/\d+$/)?.[1]));
  if (!selected.length) return [];
  return buildCapperRecap({ date, rows: selected }).reviews.map(review => ({ ...review, date,
    key: hash([date, review.name.toLowerCase().replace(/[^a-z0-9]/g, '')]).slice(0, 20),
    digest: hash([date, review.body, review.evidence]).slice(0, 20),
    parts: splitRecapBody(review.body, 3400)
  }));
}

function reviewButtons(state, disabled = false) {
  return [{ type: 1, components: [
    { type: 2, style: 3, label: 'Post to exclusive wins', custom_id: `recap-review:approve:${state.key}:${state.digest}`, disabled: disabled || state.pending > 0 },
    { type: 2, style: 4, label: 'Reject', custom_id: `recap-review:reject:${state.key}:${state.digest}`, disabled }
  ] }];
}

function payload(state, index, publicPost = false) {
  const terminal = ['PUBLISHED', 'REJECTED'].includes(state.status);
  return { allowedMentions: noMentions,
    embeds: [{ color: publicPost ? 0xD4AF37 : 0xFF7900,
      title: `${publicPost ? 'Exclusive recap' : 'Recap approval'} · ${state.date} · ${index + 1}/${state.parts.length}`,
      description: state.parts[index],
      footer: { text: publicPost
        ? `KBH recap-public ${state.key} ${state.digest} ${index} · Verified results; 21+; gambling involves risk.`
        : `KBH recap-review ${state.key} ${index} · ${state.status}${state.pending ? ` · ${state.pending} unverified; posting disabled` : ' · Kobe approval required'}` }
    }],
    components: !publicPost && index === state.parts.length - 1 ? reviewButtons(state, terminal) : [] };
}

// One cloud writer. A checkpoint precedes every send; uncertain sends are
// reconciled against a real message rather than blindly retried after restart.
function createRecapApprovals({ root, config, channelFor, loadGroups, audit = async () => {}, paused = async () => false }) {
  let tail = Promise.resolve(), stopping = false;
  const serialize = fn => {
    if (stopping) return Promise.reject(new Error('Recap worker is stopping.'));
    const result = tail.then(fn);
    tail = result.catch(() => {});
    return result;
  };
  const file = key => {
    if (!/^[a-f0-9]{20}$/.test(key)) throw new Error('Invalid recap identifier.');
    return path.join(root, `${key}.json`);
  };
  async function read(key) {
    try { return JSON.parse(await fs.readFile(file(key), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  async function save(state) {
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    await fs.writeFile(`${file(state.key)}.tmp`, JSON.stringify(state), { mode: 0o600 });
    await fs.rename(`${file(state.key)}.tmp`, file(state.key));
  }
  async function deliverPart(state, index, channel, publicPost) {
    const receipts = publicPost ? state.publicReceipts : state.reviewReceipts;
    const prior = receipts[index];
    const body = payload(state, index, publicPost);
    if (prior?.id) {
      if (!publicPost) await (await channel.messages.fetch(prior.id)).edit(body);
      return prior.id;
    }
    if (prior?.pending) {
      const messages = await channel.messages.fetch({ limit: 100 });
      const marker = body.embeds[0].footer.text.split(' · ')[0];
      const matches = [...messages.values()].filter(message => message.author?.id === channel.client.user.id
        && message.embeds?.[0]?.footer?.text?.split(' · ')[0] === marker);
      if (matches.length !== 1 || matches[0].embeds[0].description !== body.embeds[0].description) {
        throw new Error('Uncertain recap send needs receipt reconciliation; no repeat post was made.');
      }
      receipts[index] = { id: matches[0].id };
      await save(state);
      return matches[0].id;
    }
    receipts[index] = { pending: true };
    await save(state);
    try {
      const message = await channel.send({ ...body, nonce: hash([state.key, state.digest, publicPost, index]).slice(0, 24), enforceNonce: true });
      receipts[index] = { id: message.id };
      await save(state);
      return message.id;
    } catch (error) {
      // Explicit permission/validation rejection proves that no message exists.
      // Timeouts/server errors retain pending and require reconciliation.
      if ([400, 401, 403, 404, 429].includes(error.status)) { delete receipts[index]; await save(state); }
      throw error;
    }
  }
  async function reviewChannel() {
    return channelFor(config.review_channel_id, 'review');
  }
  async function refresh(state, channel) {
    for (let index = 0; index < state.parts.length; index++) await deliverPart(state, index, channel, false);
  }
  return {
    prepare(groups) { return serialize(async () => {
      if (!config.enabled || await paused()) return [];
      const channel = await reviewChannel(), receipts = [];
      for (const group of groups) {
        let state = await read(group.key);
        if (state?.status === 'PUBLISHED' || state?.status === 'PUBLISHING') continue;
        if (state?.digest === group.digest && state.reviewReceipts?.length === group.parts.length
          && state.reviewReceipts.every(receipt => receipt?.id)) continue;
        // Do not overwrite a snapshot that still has an uncertain delivery.
        if (state?.reviewReceipts?.some(receipt => receipt?.pending)) await refresh(state, channel);
        const previousParts = state?.parts.length || 0;
        const revisionChanged = state?.digest !== group.digest;
        state = { ...state, ...group, status: revisionChanged ? 'AWAITING_APPROVAL' : state.status,
          reviewReceipts: state?.reviewReceipts || [], publicReceipts: [] };
        await save(state); // Old buttons become stale before the edits.
        await refresh(state, channel);
        for (let index = group.parts.length; index < previousParts; index++) {
          const receipt = state.reviewReceipts[index];
          if (receipt?.id) await (await channel.messages.fetch(receipt.id)).edit({ content: 'Recap revision shortened; use the updated approval card above.', embeds: [], components: [], allowedMentions: noMentions });
        }
        state.reviewReceipts = state.reviewReceipts.slice(0, group.parts.length);
        await save(state);
        await audit(state, 'REVIEW_READY');
        receipts.push({ capper: state.name, date: state.date, pending: state.pending,
          messageIds: state.reviewReceipts.map(receipt => receipt.id) });
      }
      return receipts;
    }); },
    decide({ customId, userId, guildId, channelId, messageId }) { return serialize(async () => {
      if (!config.enabled || guildId !== config.guild_id || channelId !== config.review_channel_id
        || !config.reviewer_user_ids.includes(userId)) throw new Error('Only Kobe can review recaps in the configured private recap channel.');
      if (await paused()) throw new Error('The workflow is paused. No recap was posted.');
      const match = String(customId).match(/^recap-review:(approve|reject):([a-f0-9]{20}):([a-f0-9]{20})$/);
      if (!match) throw new Error('Invalid recap action.');
      const [, action, key, digest] = match, state = await read(key);
      if (!state || state.digest !== digest || state.reviewReceipts.at(-1)?.id !== messageId) throw new Error('This recap card is stale. Use the latest bot recap card.');
      if (state.status === 'PUBLISHED') return { status: 'ALREADY_PUBLISHED', messageIds: state.publicReceipts.map(receipt => receipt.id) };
      if (state.status === 'REJECTED') return { status: 'REJECTED', messageIds: [] };
      const channel = await reviewChannel();
      if (state.status !== 'PUBLISHING') {
        const current = (await loadGroups(state.date)).find(group => group.key === key);
        if (!current || current.digest !== digest) throw new Error('Grades or published wagers have changed. Wait for the refreshed recap card.');
        if (action === 'approve' && state.pending) throw new Error('Unverified results remain. This recap cannot be posted as settled.');
        state.actorId = userId;
        state.decidedAt = new Date().toISOString();
        state.status = action === 'reject' ? 'REJECTED' : 'PUBLISHING';
        // Validate the exact destination BEFORE reserving publication.
        if (action === 'approve') await channelFor(config.destination_channel_id, 'destination');
        await audit(state, state.status);
        await save(state);
      } else if (action !== 'approve' || state.actorId !== userId) {
        throw new Error('This recap publication is already reserved by its approver.');
      }
      if (state.status === 'REJECTED') {
        await refresh(state, channel);
        return { status: 'REJECTED', messageIds: [] };
      }
      const destination = await channelFor(config.destination_channel_id, 'destination');
      for (let index = 0; index < state.parts.length; index++) await deliverPart(state, index, destination, true);
      state.status = 'PUBLISHED';
      await save(state);
      await audit(state, 'PUBLISHED');
      await refresh(state, channel);
      return { status: 'PUBLISHED', messageIds: state.publicReceipts.map(receipt => receipt.id) };
    }); },
    async stop() { stopping = true; await tail; }
  };
}

module.exports = { createRecapApprovals, recapApprovalGroups, reviewButtons };
