const crypto = require('node:crypto');

let databasePool;

function getDatabasePool(databaseUrl, PoolClass) {
  if (!databasePool) {
    const Pool = PoolClass || require('pg').Pool;
    databasePool = new Pool({
      connectionString: databaseUrl,
      max: 2,
      connectionTimeoutMillis: 10000,
      query_timeout: 7500,
      statement_timeout: 7000
    });
    databasePool.on?.('error', (error) => console.error('Discord join analytics database connection failed:', error.message));
  }
  return databasePool;
}

function parseCampaigns(value) {
  if (!value) return new Map();
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('DISCORD_INVITE_CAMPAIGNS_JSON must be valid JSON.');
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('DISCORD_INVITE_CAMPAIGNS_JSON must be an object keyed by Discord invite code.');
  }
  const campaigns = new Map();
  for (const [rawCode, rawMetadata] of Object.entries(parsed)) {
    const code = String(rawCode).trim();
    if (!/^[A-Za-z0-9-]{2,64}$/.test(code)) throw new Error(`Invalid Discord invite code: ${code || '(empty)'}`);
    const metadata = rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata) ? rawMetadata : {};
    campaigns.set(code, {
      source: String(metadata.source || 'discord').slice(0, 80),
      medium: String(metadata.medium || 'discord_invite').slice(0, 80),
      campaign: String(metadata.campaign || code).slice(0, 120),
      content: metadata.content ? String(metadata.content).slice(0, 120) : null,
      referral_code: metadata.referral_code ? String(metadata.referral_code).slice(0, 120) : null
    });
  }
  return campaigns;
}

function inviteUses(invites) {
  const uses = new Map();
  for (const invite of invites?.values?.() || []) {
    if (invite?.code) uses.set(invite.code, Number(invite.uses || 0));
  }
  return uses;
}

function uniqueIncrement(previous, current) {
  const incremented = [];
  for (const [code, uses] of current) {
    if (uses > (previous.get(code) || 0)) incremented.push(code);
  }
  return incremented.length === 1 ? incremented[0] : null;
}

async function recordDiscordJoin({ fetchImpl = fetch, supabaseUrl, supabaseKey, databaseUrl, PoolClass, event }) {
  if (supabaseUrl && supabaseKey) {
    const response = await fetchImpl(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/analytics_events?on_conflict=dedupe_key`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        authorization: `Bearer ${supabaseKey}`,
        'content-type': 'application/json',
        prefer: 'resolution=ignore-duplicates,return=minimal'
      },
      body: JSON.stringify(event)
    });
    if (!response.ok) throw new Error(`Discord join analytics write failed (${response.status}).`);
    return;
  }
  if (!databaseUrl) {
    throw new Error('Discord join attribution requires either SUPABASE_URL with SUPABASE_SECRET_KEY or DATABASE_URL.');
  }
  await getDatabasePool(databaseUrl, PoolClass).query(`
    INSERT INTO analytics_events (
      id, dedupe_key, event_name, discord_user_id, path, properties, occurred_at
    ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
    ON CONFLICT (dedupe_key) DO NOTHING`, [
    event.id, event.dedupe_key, event.event_name, event.discord_user_id,
    event.path, JSON.stringify(event.properties || {}), event.occurred_at
  ]);
}

function createDiscordJoinAttribution({ campaigns, supabaseUrl, supabaseKey, databaseUrl, PoolClass, fetchImpl = fetch, logger = console }) {
  let snapshot = new Map();
  let snapshotReady = false;
  let queue = Promise.resolve();

  function serialized(operation) {
    const result = queue.then(operation, operation);
    queue = result.catch(() => {});
    return result;
  }

  async function refresh(guild) {
    const current = inviteUses(await guild.invites.fetch());
    snapshot = current;
    snapshotReady = true;
    return current;
  }

  async function initialize(guild) {
    return serialized(async () => {
      await refresh(guild);
      return { status: 'READY', inviteCount: snapshot.size, campaignCount: campaigns.size };
    });
  }

  async function joined(member) {
    return serialized(async () => {
      let current;
      let code = null;
      let reason = 'NO_UNIQUE_INCREMENT';
      try {
        current = inviteUses(await member.guild.invites.fetch());
        if (snapshotReady) code = uniqueIncrement(snapshot, current);
        else reason = 'SNAPSHOT_UNAVAILABLE';
        snapshot = current;
        snapshotReady = true;
      } catch (error) {
        snapshotReady = false;
        reason = 'INVITE_FETCH_FAILED';
        logger.error('Discord join invite snapshot needs attention:', error.message);
      }

      const metadata = code ? campaigns.get(code) : null;
      if (code && !metadata) reason = 'UNMAPPED_INVITE';
      if (metadata) reason = 'ATTRIBUTED';
      const occurredAt = new Date().toISOString();
      const event = {
        id: crypto.randomUUID(),
        dedupe_key: `discord_join:${member.guild.id}:${member.id}`,
        event_name: 'discord_join',
        discord_user_id: member.id,
        path: null,
        properties: {
          attribution_status: metadata ? 'attributed' : 'unknown',
          attribution_reason: reason,
          guild_id: member.guild.id,
          invite_code: metadata ? code : null,
          source: metadata?.source || 'unknown',
          medium: metadata?.medium || null,
          campaign: metadata?.campaign || null,
          content: metadata?.content || null,
          referral_code: metadata?.referral_code || null
        },
        occurred_at: occurredAt
      };
      await recordDiscordJoin({ fetchImpl, supabaseUrl, supabaseKey, databaseUrl, PoolClass, event });
      return event;
    });
  }

  return { initialize, joined };
}

module.exports = { createDiscordJoinAttribution, inviteUses, parseCampaigns, recordDiscordJoin, uniqueIncrement };
