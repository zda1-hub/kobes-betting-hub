const { recordApiCall, sha256 } = require('./audit-store');

function inferredService(url) {
  const host = new URL(url).hostname.toLowerCase();
  if (host === 'api.x.com' || host.endsWith('.twitter.com')) return 'x';
  if (host === 'api.openai.com') return 'openai';
  if (host === 'discord.com') return 'discord';
  if (host.includes('espn.com')) return 'espn';
  if (host.includes('stripe.com')) return 'stripe';
  if (host.endsWith('.workers.dev')) return 'cloudflare-worker';
  return host;
}

function endpointClass(url) {
  let pathname;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = new URL(String(url), 'https://audit.invalid').pathname;
  }
  return pathname
    .replace(/\/(webhooks|interactions)\/[^/]+\/[^/]+(?=\/|$)/gi, '/$1/{id}/{token}')
    .replace(/\/\d{6,}(?=\/|$)/g, '/{id}')
    .replace(/\/[0-9a-f]{24,}(?=\/|$)/gi, '/{id}')
    .replace(/\/:([a-z_]+)(?=\/|$)/gi, '/{$1}');
}

function requestBodyHash(body) {
  if (body === undefined || body === null) return null;
  if (typeof body === 'string') return sha256(body);
  if (body instanceof URLSearchParams) return sha256(body.toString());
  if (typeof body === 'object') {
    try {
      return sha256(body);
    } catch {
      return null;
    }
  }
  return null;
}

async function responseBodyHash(response) {
  const type = response.headers?.get?.('content-type') || '';
  const length = Number(response.headers?.get?.('content-length') || 0);
  if (!/(?:json|text|javascript|xml)/i.test(type) || length > 1_000_000) return null;
  try {
    return sha256(await response.clone().text());
  } catch {
    return null;
  }
}

async function auditedFetch(url, init = {}, context = {}, fetchImpl = fetch) {
  const method = String(init.method || 'GET').toUpperCase();
  const startedAt = Date.now();
  try {
    const response = await fetchImpl(url, init);
    await recordApiCall({
      service: context.service || inferredService(url),
      endpointClass: context.endpointClass || endpointClass(url),
      method,
      callerComponent: context.callerComponent || 'node-worker',
      triggerType: context.triggerType || 'runtime',
      operationId: context.operationId,
      workflowId: context.workflowId,
      pickId: context.pickId,
      memberId: context.memberId,
      providerRequestId: response.headers?.get?.('x-request-id') || response.headers?.get?.('cf-ray') || null,
      clientRequestId: context.clientRequestId,
      requestPayloadSha256: requestBodyHash(init.body),
      responsePayloadSha256: await responseBodyHash(response),
      responseStatus: response.status,
      outcome: response.ok ? 'SUCCEEDED' : 'HTTP_ERROR',
      errorClass: response.ok ? null : 'HTTP_ERROR',
      retryCount: context.retryCount || 0,
      latencyMs: Date.now() - startedAt
    });
    return response;
  } catch (error) {
    await recordApiCall({
      service: context.service || inferredService(url),
      endpointClass: context.endpointClass || endpointClass(url),
      method,
      callerComponent: context.callerComponent || 'node-worker',
      triggerType: context.triggerType || 'runtime',
      operationId: context.operationId,
      workflowId: context.workflowId,
      pickId: context.pickId,
      memberId: context.memberId,
      clientRequestId: context.clientRequestId,
      requestPayloadSha256: requestBodyHash(init.body),
      outcome: 'NETWORK_ERROR',
      errorClass: error?.name || 'NETWORK_ERROR',
      retryCount: context.retryCount || 0,
      latencyMs: Date.now() - startedAt
    });
    throw error;
  }
}

function attachDiscordRestAudit(rest, context = {}, options = {}) {
  if (!rest?.on || !rest?.off) throw new TypeError('A Discord REST event emitter is required.');
  const recordImpl = options.recordImpl || recordApiCall;
  const onError = options.onError || ((error) => console.error('Unable to persist Discord API audit event:', error?.message || error));
  const pending = new Set();
  const listener = (request = {}, response = {}) => {
    const job = (async () => {
      await recordImpl({
        service: 'discord',
        endpointClass: endpointClass(request.route || request.path || '/unknown'),
        method: String(request.method || 'GET').toUpperCase(),
        callerComponent: context.callerComponent || 'discord-sdk',
        triggerType: context.triggerType || 'runtime',
        operationId: context.operationId,
        workflowId: context.workflowId,
        pickId: context.pickId,
        memberId: context.memberId,
        providerRequestId: response.headers?.get?.('x-request-id') || response.headers?.get?.('cf-ray') || null,
        clientRequestId: context.clientRequestId,
        requestPayloadSha256: requestBodyHash(request.data?.body),
        responsePayloadSha256: await responseBodyHash(response),
        responseStatus: Number.isFinite(response.status) ? response.status : null,
        outcome: response.ok ? 'SUCCEEDED' : 'HTTP_ERROR',
        errorClass: response.ok ? null : 'HTTP_ERROR',
        retryCount: Number.isInteger(request.retries) ? request.retries : 0
      });
    })();
    pending.add(job);
    job.catch(onError).finally(() => pending.delete(job));
  };
  rest.on('response', listener);
  return {
    async flush() {
      while (pending.size) await Promise.allSettled([...pending]);
    },
    detach() {
      rest.off('response', listener);
    }
  };
}

module.exports = { attachDiscordRestAudit, auditedFetch, endpointClass, inferredService, requestBodyHash };
