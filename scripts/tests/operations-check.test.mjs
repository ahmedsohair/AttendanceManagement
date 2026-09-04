import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

const script = new URL('../check-staging-operations.mjs', import.meta.url).href;
const secret = 'synthetic-operations-test-secret-not-a-real-key';
function run(status, body, url = 'https://exampulse-stagings.vercel.app/api/operations/check', throws = false) {
  const source = `globalThis.fetch = async (url, options) => {
    if (url !== 'https://exampulse-stagings.vercel.app/api/operations/check' || options.method !== 'POST' || options.redirect !== 'error') throw Error('Unsafe request');
    if (${throws}) throw Error('private connection failure');
    return {status:${status},json:async()=>(${JSON.stringify(body)})};
  }; await import(${JSON.stringify(script)});`;
  return spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    encoding: 'utf8', timeout: 10000,
    env: { ...process.env, OPS_CHECK_URL: url, OPS_CHECK_SECRET: secret }
  });
}

test('scheduler check succeeds for checked responses including suppressed alerts', () => {
  for (const body of [{status:'checked',accepted:1,unknown:0,suppressed:0}, {status:'checked',accepted:0,unknown:0,suppressed:1}]) {
    assert.equal(run(200, body).status, 0);
  }
});

test('scheduler exits nonzero for unauthorized, unavailable, unknown delivery and invalid responses', () => {
  for (const [status, body] of [[401,{status:'unauthorized'}], [503,{status:'monitoring_unavailable'}], [502,{status:'delivery_unconfirmed'}], [200,{}]]) {
    const result = run(status, body);
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(secret));
  }
  assert.equal(run(200, {}, undefined, true).status, 1);
});

test('scheduler refuses production targets before sending a request', () => {
  const result = run(200, {status:'checked'}, 'https://exampulse.xyz/api/operations/check');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /exact staging/);
});
