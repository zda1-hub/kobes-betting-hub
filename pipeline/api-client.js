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
  const enqueue = (event) => {
    const job = Promise.resolve(event).then((resolved) => recordImpl(resolved));
    pending.add(job);
    job.catch(onError).finally(() => pending.delete(job));
  };
  const listener = (request = {}, response = {}) => {
    enqueue((async () => ({
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
      }))());
  };
  rest.on('response', listener);
  const originalQueueRequest = typeof rest.queueRequest === 'function' ? rest.queueRequest : null;
  let auditedQueueRequest = null;
  if (originalQueueRequest) {
    auditedQueueRequest = async function(request = {}) {
      const startedAt = Date.now();
      try {
        return await originalQueueRequest.call(this, request);
      } catch (error) {
        // DiscordAPIError and HTTPError have a status and were already captured
        // by the SDK's response event. The remaining failures happened before
        // any response existed (network, abort, local rate-limit rejection).
        if (!Number.isFinite(error?.status)) {
          const errorName = String(error?.constructor?.name || error?.name || '');
          const errorClass = /abort/i.test(errorName)
            ? 'ABORTED'
            : /ratelimit/i.test(errorName)
              ? 'RATE_LIMIT_REJECTED'
              : errorName === 'TypeError'
                ? 'NETWORK_ERROR'
                : 'REQUEST_ERROR';
          enqueue({
            service: 'discord',
            endpointClass: endpointClass(request.fullRoute || request.route || '/unknown'),
            method: String(request.method || 'GET').toUpperCase(),
            callerComponent: context.callerComponent || 'discord-sdk',
            triggerType: context.triggerType || 'runtime',
            operationId: context.operationId,
            workflowId: context.workflowId,
            pickId: context.pickId,
            memberId: context.memberId,
            clientRequestId: context.clientRequestId,
            requestPayloadSha256: requestBodyHash(request.body),
            responsePayloadSha256: null,
            responseStatus: null,
            outcome: 'NETWORK_ERROR',
            errorClass,
            retryCount: 0,
            latencyMs: Date.now() - startedAt
          });
        }
        throw error;
      }
    };
    rest.queueRequest = auditedQueueRequest;
  }
  return {
    async flush() {
      while (pending.size) await Promise.allSettled([...pending]);
    },
    detach() {
      rest.off('response', listener);
      if (auditedQueueRequest && rest.queueRequest === auditedQueueRequest) rest.queueRequest = originalQueueRequest;
    }
  };
}

module.exports = { attachDiscordRestAudit, auditedFetch, endpointClass, inferredService, requestBodyHash };
