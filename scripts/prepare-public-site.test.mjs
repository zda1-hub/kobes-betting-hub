import test from 'node:test';
import assert from 'node:assert/strict';

import {
  injectMembershipConfig,
  productionMembershipWorkerOrigin,
  resolveMembershipConfig,
} from './prepare-public-site.mjs';

test('production site preparation preserves the production membership origin', () => {
  assert.deepEqual(resolveMembershipConfig({}), {
    environment: 'production',
    workerOrigin: productionMembershipWorkerOrigin,
  });
});

test('staging site preparation requires a distinct HTTPS membership origin', () => {
  assert.throws(
    () => resolveMembershipConfig({ KBH_SITE_ENV: 'staging' }),
    /require KBH_MEMBERSHIP_WORKER_ORIGIN/,
  );
  assert.throws(
    () => resolveMembershipConfig({
      KBH_SITE_ENV: 'staging',
      KBH_MEMBERSHIP_WORKER_ORIGIN: productionMembershipWorkerOrigin,
    }),
    /cannot use the production membership Worker origin/,
  );
  assert.throws(
    () => resolveMembershipConfig({
      KBH_SITE_ENV: 'staging',
      KBH_MEMBERSHIP_WORKER_ORIGIN: 'http://checkout-staging.example.com',
    }),
    /valid HTTPS origin/,
  );

  assert.deepEqual(resolveMembershipConfig({
    KBH_SITE_ENV: 'staging',
    KBH_MEMBERSHIP_WORKER_ORIGIN: 'https://checkout-staging.example.com',
  }), {
    environment: 'staging',
    workerOrigin: 'https://checkout-staging.example.com',
  });
});

test('membership configuration injection replaces exactly one browser config block', () => {
  const source = '<script>window.__KBH_MEMBERSHIP_CONFIG__ = Object.freeze({"environment":"production","workerOrigin":"https://production.example"});</script>';
  const output = injectMembershipConfig(source, {
    environment: 'staging',
    workerOrigin: 'https://staging.example',
  }, 'join.html');

  assert.match(output, /"environment":"staging"/);
  assert.match(output, /"workerOrigin":"https:\/\/staging\.example"/);
  assert.doesNotMatch(output, /production\.example/);
  assert.throws(() => injectMembershipConfig('<html></html>', {}, 'join.html'), /exactly one/);
});
