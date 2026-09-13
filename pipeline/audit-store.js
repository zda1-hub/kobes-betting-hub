const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const MIGRATION_DIRECTORY = path.join(__dirname, 'migrations');
const DEFAULT_PROMPT_VERSION = 'source-pick-extraction-v1';
let pool;
let initialized = false;
let initializationPromise;
let warnedMissing = false;

function databaseUrl() {
  return (process.env.DATABASE_URL || '').trim();
}

function auditConfigured() {
  return Boolean(databaseUrl());
}

function auditRequired() {
  return process.env.AUDIT_DATABASE_REQUIRED === 'true';
}

function codeCommit() {
  return (process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || '').trim() || null;
}

function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

function nowIso() {
  return new Date().toISOString();
}

function getPool() {
  if (!databaseUrl()) {
    if (auditRequired()) throw new Error('AUDIT_DATABASE_REQUIRED=true but DATABASE_URL is not configured.');
    if (!warnedMissing) {
      warnedMissing = true;
      console.warn('Pick-operation database audit is disabled because DATABASE_URL is not configured.');
    }
    return null;
  }
  if (!pool) {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: databaseUrl(), max: 6, connectionTimeoutMillis: 10000 });
    pool.on('error', (error) => console.error('Idle audit database connection failed:', error.message));
  }
  return pool;
}

async function initializeAuditStore() {
  const currentPool = getPool();
  if (!currentPool) return false;
  if (!initialized && !initializationPromise) {
    initializationPromise = (async () => {
      const migrations = (await fs.readdir(MIGRATION_DIRECTORY))
        .filter((name) => /^\d+.*\.sql$/.test(name))
        .sort();
      for (const migration of migrations) {
        await currentPool.query(await fs.readFile(path.join(MIGRATION_DIRECTORY, migration), 'utf8'));
      }
      initialized = true;
    })().catch((error) => {
      initializationPromise = undefined;
      throw error;
    });
  }
  if (initializationPromise) await initializationPromise;
  return true;
}

async function query(text, values = []) {
  const currentPool = getPool();
  if (!currentPool) return null;
  await initializeAuditStore();
  return currentPool.query(text, values);
}

function sourceFields(input) {
  if (input?.source && input?.post) {
    return {
      platform: 'Twitter/X',
      externalPostId: String(input.post.id),
      sourceHandle: input.source.handle || '',
      postUrl: `https://x.com/${input.source.handle}/status/${input.post.id}`,
      postedAt: input.post.created_at || null,
      rawText: input.post.text || '',
      mediaUrls: input.mediaUrls || []
    };
  }
  const source = input?.source || {};
  return {
    platform: source.platform || 'Twitter/X',
    externalPostId: String(source.post_id || ''),
    sourceHandle: source.handle || '',
    postUrl: source.post_url || null,
    postedAt: source.posted_at || null,
    rawText: source.text || '',
    mediaUrls: source.media_urls || []
  };
}

async function recordSourcePost(input) {
  const fields = sourceFields(input);
  if (!fields.externalPostId || !fields.sourceHandle) return null;
  const timestamp = nowIso();
  const result = await query(`
    INSERT INTO source_posts (
      id, platform, external_post_id, source_handle, post_url, posted_at,
      raw_text, media_urls, media_url_hashes, first_seen_at, last_seen_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$10)
    ON CONFLICT (platform, external_post_id) DO UPDATE SET
      source_handle = EXCLUDED.source_handle,
      post_url = EXCLUDED.post_url,
      posted_at = COALESCE(EXCLUDED.posted_at, source_posts.posted_at),
      raw_text = EXCLUDED.raw_text,
      media_urls = EXCLUDED.media_urls,
      media_url_hashes = EXCLUDED.media_url_hashes,
      last_seen_at = EXCLUDED.last_seen_at
    RETURNING id`, [
      crypto.randomUUID(), fields.platform, fields.externalPostId, fields.sourceHandle,
      fields.postUrl, fields.postedAt, fields.rawText, JSON.stringify(fields.mediaUrls),
      JSON.stringify(fields.mediaUrls.map((url) => sha256(url))), timestamp
    ]);
  return result?.rows?.[0]?.id || null;
}

function usageFromResponse(response) {
  const usage = response?.usage || {};
  const inputDetails = usage.input_tokens_details || {};
  return {
    inputTokens: Number.isFinite(usage.input_tokens) ? usage.input_tokens : null,
    cachedInputTokens: Number.isFinite(inputDetails.cached_tokens) ? inputDetails.cached_tokens : null,
    imageTokens: Number.isFinite(inputDetails.image_tokens) ? inputDetails.image_tokens : null,
    outputTokens: Number.isFinite(usage.output_tokens) ? usage.output_tokens : null
  };
}

function estimateOpenAICost(model, usage, env = process.env) {
  const defaults = {
    'gpt-5-mini': { input: 0.25, cachedInput: 0.025, output: 2 },
    'gpt-5.6-luna': { input: 0.20, cachedInput: 0.02, output: 1.20 }
  }[model] || null;
  const inputRate = Number(env.OPENAI_PICK_INPUT_USD_PER_MILLION || defaults?.input);
  const cachedInputRate = Number(env.OPENAI_PICK_CACHED_INPUT_USD_PER_MILLION || defaults?.cachedInput || inputRate);
  const outputRate = Number(env.OPENAI_PICK_OUTPUT_USD_PER_MILLION || defaults?.output);
  if (!Number.isFinite(inputRate) || !Number.isFinite(cachedInputRate) || !Number.isFinite(outputRate)
    || !Number.isFinite(usage.inputTokens) || !Number.isFinite(usage.outputTokens)) return null;
  const cachedInputTokens = Math.max(0, Math.min(
    usage.inputTokens,
    Number.isFinite(usage.cachedInputTokens) ? usage.cachedInputTokens : 0
  ));
  const uncachedInputTokens = usage.inputTokens - cachedInputTokens;
  return (uncachedInputTokens * inputRate + cachedInputTokens * cachedInputRate
    + usage.outputTokens * outputRate) / 1_000_000;
}

async function findReusableExtraction({ sourcePostId, provider, model, promptVersion, inputSha256 }) {
  if (!sourcePostId) return null;
  const result = await query(`
    SELECT id, request_id, provider_response_id, input_tokens, cached_input_tokens, image_tokens,
           output_tokens, estimated_cost_usd, latency_ms, raw_structured_output
    FROM extraction_runs
    WHERE source_post_id=$1 AND provider=$2 AND model=$3 AND prompt_version=$4
      AND input_sha256=$5 AND status='SUCCEEDED'
    ORDER BY completed_at DESC LIMIT 1`, [sourcePostId, provider, model, promptVersion, inputSha256]);
  return result?.rows?.[0] || null;
}

async function startExtractionRun({ sourcePostId, provider, model, promptVersion, inputSha256, imageCount, imageDetail }) {
  if (!sourcePostId) return null;
  const id = crypto.randomUUID();
  const createdAt = nowIso();
  await query(`
    INSERT INTO extraction_runs (
      id, source_post_id, provider, model, prompt_version, code_commit,
      input_sha256, started_at, image_count, image_detail, status, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'STARTED',$8)`, [
      id, sourcePostId, provider, model, promptVersion, codeCommit(), inputSha256,
      createdAt, imageCount, imageDetail || null
    ]);
  return id;
}

async function finishExtractionRun(id, fields) {
  if (!id) return;
  await query(`
    UPDATE extraction_runs SET
      request_id=$2, provider_response_id=$3, completed_at=$4, latency_ms=$5, response_status=$6,
      input_tokens=$7, cached_input_tokens=$8, image_tokens=$9, output_tokens=$10,
      estimated_cost_usd=$11, cost_basis=$12, status=$13, error_code=$14,
      error_detail=$15, raw_structured_output=$16::jsonb
    WHERE id=$1`, [
      id, fields.requestId || null, fields.providerResponseId || null,
      fields.completedAt || nowIso(), fields.latencyMs ?? null,
      fields.responseStatus ?? null, fields.usage?.inputTokens ?? null,
      fields.usage?.cachedInputTokens ?? null, fields.usage?.imageTokens ?? null,
      fields.usage?.outputTokens ?? null, fields.estimatedCostUsd ?? null,
      fields.costBasis || null, fields.status, fields.errorCode || null,
      fields.errorDetail || null, fields.rawStructuredOutput === undefined ? null : JSON.stringify(fields.rawStructuredOutput)
    ]);
}

async function upsertPickCandidate(packet, { status, rejectionCodes = [] } = {}) {
  const sourcePostId = await recordSourcePost(packet);
  if (!sourcePostId) return null;
  const extractionVersion = packet.analysis?.prompt_version || DEFAULT_PROMPT_VERSION;
  const candidateKey = packet.approval_number > 0 && packet.pick_id
    ? packet.pick_id
    : `source:${packet.source.post_id}`;
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  const result = await query(`
    INSERT INTO pick_candidates (
      id, source_post_id, extraction_run_id, candidate_key, extraction_version,
      status, rejection_codes, payload, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$9)
    ON CONFLICT (source_post_id, candidate_key, extraction_version) DO UPDATE SET
      extraction_run_id=COALESCE(EXCLUDED.extraction_run_id, pick_candidates.extraction_run_id),
      status=EXCLUDED.status, rejection_codes=EXCLUDED.rejection_codes,
      payload=EXCLUDED.payload, updated_at=EXCLUDED.updated_at
    RETURNING id`, [
      id, sourcePostId, packet.analysis?.extraction_run_id || null, candidateKey,
      extractionVersion, status || packet.status || 'OBSERVED', rejectionCodes,
      JSON.stringify(packet), timestamp
    ]);
  return result?.rows?.[0]?.id || null;
}

async function candidateIdFor(packet) {
  const sourcePostId = await recordSourcePost(packet);
  if (!sourcePostId) return null;
  const candidateKey = packet.approval_number > 0 && packet.pick_id
    ? packet.pick_id
    : `source:${packet.source.post_id}`;
  const extractionVersion = packet.analysis?.prompt_version || DEFAULT_PROMPT_VERSION;
  const result = await query(`SELECT id FROM pick_candidates WHERE source_post_id=$1 AND candidate_key=$2 AND extraction_version=$3`, [sourcePostId, candidateKey, extractionVersion]);
  return result?.rows?.[0]?.id || upsertPickCandidate(packet);
}

async function recordWorkflowEvent(packet, { eventType, actorType = 'system', actorId = null, beforeState = null, afterState = null, details = {} }) {
  const sourcePostId = packet ? await recordSourcePost(packet) : null;
  const candidateId = packet ? await candidateIdFor(packet) : null;
  await query(`
    INSERT INTO workflow_events (
      id, source_post_id, candidate_id, event_type, actor_type, actor_id,
      before_state, after_state, code_commit, prompt_version, details, occurred_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)`, [
      crypto.randomUUID(), sourcePostId, candidateId, eventType, actorType, actorId,
      beforeState, afterState, codeCommit(), packet?.analysis?.prompt_version || DEFAULT_PROMPT_VERSION,
      JSON.stringify(details), nowIso()
    ]);
}

async function recordApprovalCard(packet, { channelId, messageId, payload }) {
  const candidateId = await upsertPickCandidate(packet, { status: 'READY_FOR_APPROVAL' });
  if (!candidateId || !messageId) return;
  await query(`
    INSERT INTO approval_cards (
      id, candidate_id, discord_channel_id, discord_message_id, rendered_payload,
      rendered_payload_sha256, status, created_at
    ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,'PENDING',$7)
    ON CONFLICT (discord_channel_id, discord_message_id) DO NOTHING`, [
      crypto.randomUUID(), candidateId, channelId, messageId, JSON.stringify(payload), sha256(payload), nowIso()
    ]);
  await recordWorkflowEvent(packet, { eventType: 'APPROVAL_CARD_CREATED', afterState: 'PENDING_APPROVAL', details: { channel_id: channelId, message_id: messageId } });
}

async function recordApprovalAction(packet, { action, actorId, status }) {
  const candidateId = await candidateIdFor(packet);
  if (!candidateId) return;
  await query(`UPDATE approval_cards SET status=$2, action=$3, action_actor_id=$4, action_at=$5 WHERE candidate_id=$1 AND status='PENDING'`, [candidateId, status, action, actorId, nowIso()]);
  await recordWorkflowEvent(packet, { eventType: 'APPROVAL_ACTION', actorType: 'discord_user', actorId, beforeState: 'PENDING_APPROVAL', afterState: status, details: { action } });
}

async function recordPublicationAttempt(packet, { entry, payload }) {
  const candidateId = packet ? await upsertPickCandidate(packet, { status: 'PUBLISHING' }) : null;
  const timestamp = nowIso();
  await query(`
    INSERT INTO published_picks (
      id, candidate_id, pick_id, ledger_entry, exact_payload, exact_payload_sha256,
      status, created_at, updated_at
    ) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,'PUBLISHING',$7,$7)
    ON CONFLICT (pick_id) DO UPDATE SET
      ledger_entry=EXCLUDED.ledger_entry,
      exact_payload=EXCLUDED.exact_payload,
      exact_payload_sha256=EXCLUDED.exact_payload_sha256,
      status='PUBLISHING', error_detail=NULL, updated_at=EXCLUDED.updated_at`, [
      crypto.randomUUID(), candidateId, entry.pick_id, JSON.stringify(entry), JSON.stringify(payload), sha256(payload), timestamp
    ]);
}

async function recordPublicationResult(packet, { pickId, channelId = null, messageId = null, postReference = null, status, errorDetail = null }) {
  await query(`UPDATE published_picks SET discord_channel_id=$2, discord_message_id=$3, post_reference=$4, status=$5, error_detail=$6, published_at=CASE WHEN $5='PUBLISHED' THEN $7::timestamptz ELSE published_at END, updated_at=$7 WHERE pick_id=$1`, [pickId, channelId, messageId, postReference, status, errorDetail, nowIso()]);
  if (packet) {
    const candidateId = await candidateIdFor(packet);
    if (candidateId) await query('UPDATE approval_cards SET status=$2 WHERE candidate_id=$1', [candidateId, status]);
  }
  if (packet) await recordWorkflowEvent(packet, { eventType: status === 'PUBLISHED' ? 'PUBLICATION_SUCCEEDED' : 'PUBLICATION_FAILED', afterState: status, details: { pick_id: pickId, channel_id: channelId, message_id: messageId, error: errorDetail } });
}

async function recordGradeAttempt({ pickId, result, status, provider, sourceReference, snapshot = {}, actorType = 'system', actorId = null, errorDetail = null }) {
  const published = await query('SELECT id FROM published_picks WHERE pick_id=$1', [pickId]);
  const publishedPickId = published?.rows?.[0]?.id;
  if (!publishedPickId) return;
  await query(`INSERT INTO grades (id, published_pick_id, result, status, provider, source_reference, source_snapshot, actor_type, actor_id, error_detail, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)`, [crypto.randomUUID(), publishedPickId, result || null, status, provider || null, sourceReference || null, JSON.stringify(snapshot), actorType, actorId, errorDetail, nowIso()]);
}

async function recordRecapRun({ operatingDate, recapType = 'official_email', includedPickIds = [], status, recipient = null, providerMessageId = null, content = '', errorDetail = null, details = {} }) {
  await query(`INSERT INTO recap_runs (id, operating_date, recap_type, included_pick_ids, status, recipient, provider_message_id, content_sha256, error_detail, details, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`, [crypto.randomUUID(), operatingDate, recapType, includedPickIds, status, recipient, providerMessageId, content ? sha256(content) : null, errorDetail, JSON.stringify(details), nowIso()]);
}

async function recordApiCall({
  service,
  endpointClass,
  method = 'GET',
  callerComponent = 'unknown',
  triggerType = 'runtime',
  operationId = null,
  workflowId = null,
  pickId = null,
  memberId = null,
  providerRequestId = null,
  clientRequestId = null,
  requestPayloadSha256 = null,
  responsePayloadSha256 = null,
  responseStatus = null,
  outcome,
  errorClass = null,
  retryCount = 0,
  latencyMs = null
}) {
  if (!service || !endpointClass || !outcome) return;
  await query(`INSERT INTO api_call_events (
    id, environment, operation_id, workflow_id, pick_id, member_id,
    service, endpoint_class, method, caller_component, trigger_type,
    provider_request_id, client_request_id, request_payload_sha256,
    response_payload_sha256, response_status, outcome, error_class,
    retry_count, latency_ms, code_commit, occurred_at
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`, [
    crypto.randomUUID(), process.env.APP_ENV || process.env.NODE_ENV || 'production',
    operationId, workflowId, pickId, memberId, service, endpointClass,
    method, callerComponent, triggerType, providerRequestId, clientRequestId,
    requestPayloadSha256, responsePayloadSha256, responseStatus, outcome,
    errorClass, retryCount, latencyMs, codeCommit(), nowIso()
  ]);
}

function openAIBudgetLimits(env = process.env) {
  const positive = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  return {
    dailyRequests: positive(env.OPENAI_DAILY_REQUEST_LIMIT),
    monthlyRequests: positive(env.OPENAI_MONTHLY_REQUEST_LIMIT),
    dailyUsd: positive(env.OPENAI_DAILY_BUDGET_USD),
    monthlyUsd: positive(env.OPENAI_MONTHLY_BUDGET_USD)
  };
}

function evaluateOpenAIBudget(usage, limits) {
  const checks = [
    ['dailyRequests', 'daily request limit'],
    ['monthlyRequests', 'monthly request limit'],
    ['dailyUsd', 'daily dollar budget'],
    ['monthlyUsd', 'monthly dollar budget']
  ];
  for (const [field, label] of checks) {
    if (limits[field] !== null && Number(usage[field] || 0) >= limits[field]) {
      return { allowed: false, reason: `OpenAI ${label} reached (${usage[field]} / ${limits[field]}).`, usage, limits };
    }
  }
  return { allowed: true, reason: null, usage, limits };
}

async function openAIBudgetStatus(env = process.env) {
  const limits = openAIBudgetLimits(env);
  if (Object.values(limits).every((value) => value === null)) {
    return { allowed: true, reason: null, usage: {}, limits };
  }
  const result = await query(`SELECT
    COUNT(*) FILTER (WHERE started_at >= date_trunc('day', NOW() AT TIME ZONE 'America/Phoenix') AT TIME ZONE 'America/Phoenix')::int AS daily_requests,
    COUNT(*) FILTER (WHERE started_at >= date_trunc('month', NOW() AT TIME ZONE 'America/Phoenix') AT TIME ZONE 'America/Phoenix')::int AS monthly_requests,
    COALESCE(SUM(estimated_cost_usd) FILTER (WHERE started_at >= date_trunc('day', NOW() AT TIME ZONE 'America/Phoenix') AT TIME ZONE 'America/Phoenix'), 0)::float8 AS daily_usd,
    COALESCE(SUM(estimated_cost_usd) FILTER (WHERE started_at >= date_trunc('month', NOW() AT TIME ZONE 'America/Phoenix') AT TIME ZONE 'America/Phoenix'), 0)::float8 AS monthly_usd
    FROM extraction_runs WHERE provider='openai'`);
  if (!result) return { allowed: true, reason: null, usage: {}, limits };
  const row = result.rows[0] || {};
  return evaluateOpenAIBudget({
    dailyRequests: Number(row.daily_requests || 0),
    monthlyRequests: Number(row.monthly_requests || 0),
    dailyUsd: Number(row.daily_usd || 0),
    monthlyUsd: Number(row.monthly_usd || 0)
  }, limits);
}

async function recordProviderUsageSnapshot(values) {
  const snapshotKey = sha256([
    values.provider, values.source, values.windowStart, values.windowEnd,
    values.projectReference || '', values.apiKeyReference || '', values.model || ''
  ].join('|'));
  await query(`
    INSERT INTO provider_usage_snapshots (
      id, snapshot_key, provider, account_reference, project_reference, api_key_reference,
      model, window_start, window_end, request_count, input_tokens, cached_input_tokens,
      output_tokens, provider_cost_usd, source, payload_sha256, imported_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    ON CONFLICT (snapshot_key) WHERE snapshot_key IS NOT NULL DO UPDATE SET
      request_count=EXCLUDED.request_count, input_tokens=EXCLUDED.input_tokens,
      cached_input_tokens=EXCLUDED.cached_input_tokens, output_tokens=EXCLUDED.output_tokens,
      provider_cost_usd=EXCLUDED.provider_cost_usd, payload_sha256=EXCLUDED.payload_sha256,
      imported_at=EXCLUDED.imported_at`, [
      crypto.randomUUID(), snapshotKey, values.provider, values.accountReference || null,
      values.projectReference || null, values.apiKeyReference || null, values.model || null,
      values.windowStart, values.windowEnd, values.requestCount ?? null,
      values.inputTokens ?? null, values.cachedInputTokens ?? null, values.outputTokens ?? null,
      values.providerCostUsd ?? null, values.source, values.payloadSha256 || null, nowIso()
    ]);
  return snapshotKey;
}

async function readAuditTimeline(identifier) {
  if (!auditConfigured()) return { configured: false };
  const postId = String(identifier || '').match(/\/status\/(\d+)/)?.[1] || String(identifier || '').trim();
  const target = await query(`
    SELECT DISTINCT sp.id, sp.source_handle, sp.external_post_id, sp.post_url, sp.posted_at
    FROM source_posts sp
    LEFT JOIN pick_candidates pc ON pc.source_post_id=sp.id
    WHERE pc.candidate_key=$1 OR sp.post_url=$1 OR sp.external_post_id=$2
    ORDER BY sp.posted_at DESC NULLS LAST
    LIMIT 1`, [String(identifier || '').trim(), postId]);
  const source = target?.rows?.[0];
  if (!source) return { configured: true, found: false };
  const [extractions, candidates, events, approvals, publications, grades, recaps] = await Promise.all([
    query(`SELECT id, provider, model, prompt_version, request_id, provider_response_id, started_at, completed_at, latency_ms, input_tokens, image_tokens, output_tokens, image_count, estimated_cost_usd, cost_basis, status, error_code, error_detail FROM extraction_runs WHERE source_post_id=$1 ORDER BY started_at`, [source.id]),
    query('SELECT id, candidate_key, status, rejection_codes, created_at, updated_at FROM pick_candidates WHERE source_post_id=$1 ORDER BY created_at', [source.id]),
    query('SELECT we.event_type, we.actor_type, we.actor_id, we.before_state, we.after_state, we.details, we.occurred_at, pc.candidate_key FROM workflow_events we LEFT JOIN pick_candidates pc ON pc.id=we.candidate_id WHERE we.source_post_id=$1 ORDER BY we.occurred_at', [source.id]),
    query('SELECT ac.discord_channel_id, ac.discord_message_id, ac.status, ac.action, ac.action_actor_id, ac.action_at, ac.created_at, pc.candidate_key FROM approval_cards ac JOIN pick_candidates pc ON pc.id=ac.candidate_id WHERE pc.source_post_id=$1 ORDER BY ac.created_at', [source.id]),
    query('SELECT pp.id, pp.pick_id, pp.discord_channel_id, pp.discord_message_id, pp.post_reference, pp.status, pp.error_detail, pp.published_at, pp.created_at FROM published_picks pp JOIN pick_candidates pc ON pc.id=pp.candidate_id WHERE pc.source_post_id=$1 ORDER BY pp.created_at', [source.id]),
    query('SELECT g.result, g.status, g.provider, g.source_reference, g.actor_type, g.actor_id, g.error_detail, g.created_at, pp.pick_id FROM grades g JOIN published_picks pp ON pp.id=g.published_pick_id JOIN pick_candidates pc ON pc.id=pp.candidate_id WHERE pc.source_post_id=$1 ORDER BY g.created_at', [source.id]),
    query('SELECT operating_date, status, recipient, provider_message_id, created_at, included_pick_ids FROM recap_runs WHERE included_pick_ids && ARRAY(SELECT candidate_key FROM pick_candidates WHERE source_post_id=$1) ORDER BY created_at', [source.id])
  ]);
  return {
    configured: true,
    found: true,
    source,
    extractions: extractions.rows,
    candidates: candidates.rows,
    events: events.rows,
    approvals: approvals.rows,
    publications: publications.rows,
    grades: grades.rows,
    recaps: recaps.rows
  };
}

async function closeAuditStore() {
  if (pool) await pool.end();
  pool = undefined;
  initialized = false;
  initializationPromise = undefined;
}

module.exports = {
  DEFAULT_PROMPT_VERSION,
  auditConfigured,
  auditRequired,
  closeAuditStore,
  estimateOpenAICost,
  findReusableExtraction,
  finishExtractionRun,
  initializeAuditStore,
  evaluateOpenAIBudget,
  openAIBudgetLimits,
  openAIBudgetStatus,
  recordProviderUsageSnapshot,
  recordApprovalAction,
  recordApiCall,
  recordApprovalCard,
  recordGradeAttempt,
  recordPublicationAttempt,
  recordPublicationResult,
  recordRecapRun,
  recordSourcePost,
  recordWorkflowEvent,
  readAuditTimeline,
  sha256,
  startExtractionRun,
  upsertPickCandidate,
  usageFromResponse
};
