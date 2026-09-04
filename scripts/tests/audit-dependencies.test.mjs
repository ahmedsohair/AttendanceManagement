import assert from 'node:assert/strict';
import test from 'node:test';
import { auditOsv, nativeOutcome, productionPackages, createOsvRequest } from '../audit-dependencies.mjs';

const pkg = (version = '1.0.0') => ({ version, resolved: `https://registry.npmjs.org/example/-/example-${version}.tgz` });
test('production inventory includes nested, optional and aliased dependencies; excludes dev and known workspace links', () => {
  const lock = { lockfileVersion: 3, packages: { '': {}, 'apps/admin': {},
    'node_modules/example': pkg(), 'node_modules/parent/node_modules/example': pkg('2.0.0'),
    'node_modules/alias': { ...pkg(), name: 'actual' }, 'node_modules/dev': { ...pkg(), dev: true },
    'node_modules/optional': { ...pkg(), optional: true }, 'node_modules/@algo-attendance/admin': { link: true, resolved: 'apps/admin' } } };
  assert.equal(productionPackages(lock).length, 4);
  for (const bad of [{ link: true, resolved: '../private' }, { ...pkg(), resolved: 'git+https://example.test/x' }, { ...pkg(), version: 'latest' }]) {
    assert.throws(() => productionPackages({ ...lock, packages: { 'node_modules/x': bad } }));
  }
  assert.throws(() => productionPackages({ lockfileVersion: 3, packages: {} }));
});
test('npm critical findings and malformed reports never pass or trigger fallback', () => {
  const stdout = JSON.stringify({ metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 2, critical: 0, total: 2 } } });
  assert.equal(nativeOutcome({ status: 0, stdout }), 'pass');
  assert.equal(nativeOutcome({ status: 1, stdout }), 'invalid');
  assert.equal(nativeOutcome({ status: 1, stdout: stdout.replace('"critical":0', '"critical":1') }), 'critical');
  assert.equal(nativeOutcome({ status: 0, stdout: '{}' }), 'invalid');
  assert.equal(nativeOutcome({ stdout: JSON.stringify({ error: { code: 'FETCH_ERROR' } }) }), 'unavailable');
  assert.equal(nativeOutcome({ error: { code: 'ETIMEDOUT' } }), 'unavailable');
});
const queries = [{ package: { ecosystem: 'npm', name: 'example' }, version: '1.0.0' }];
test('OSV follows pagination, deduplicates advisories and preserves critical classification', async () => {
  let calls = 0;
  const report = await auditOsv(queries, async (path, body) => {
    calls++;
    if (!body) return { id: 'GHSA-test', modified: '2026-01-01T00:00:00Z', database_specific: { severity: 'CRITICAL' } };
    return { results: [{ vulns: [{ id: 'GHSA-test' }], ...(body.queries[0].page_token ? {} : { next_page_token: 'next' }) }] };
  });
  assert.equal(calls, 3); assert.equal(report.critical, 1); assert.equal(report.findings.length, 1);
});
test('missing results, error objects, unknown severity and endless pagination fail closed', async () => {
  for (const response of [{}, { results: [] }, { results: [{ error: 'failure' }] }, { results: [{ vulns: 'bad' }] }]) await assert.rejects(auditOsv(queries, async () => response));
  await assert.rejects(auditOsv(queries, async (_path, body) => body ? { results: [{ vulns: [{ id: 'GHSA-test' }] }] } : { id: 'GHSA-test', modified: '2026-01-01' }));
  await assert.rejects(auditOsv(queries, async () => ({ results: [{ next_page_token: 'repeat' }] })));
});
test('HTTP failures and invalid JSON do not become empty clean reports', async () => {
  await assert.rejects(createOsvRequest(async () => new Response('', { status: 503 }))('/v1/querybatch', {}));
  await assert.rejects(createOsvRequest(async () => new Response('invalid'))('/v1/querybatch', {}));
});
