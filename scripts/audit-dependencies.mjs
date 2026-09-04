import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export function productionPackages(lock) {
  if (![2, 3].includes(lock.lockfileVersion) || !lock.packages || typeof lock.packages !== 'object') throw new Error('Unsupported lockfile.');
  const packages = new Map();
  for (const [path, item] of Object.entries(lock.packages)) {
    if (!path.includes('node_modules/') || item.dev === true) continue;
    if (item.link) {
      if (!['apps/admin', 'apps/mobile', 'packages/shared'].includes(item.resolved) || !lock.packages[item.resolved]) throw new Error('Unrecognized linked dependency.');
      continue;
    }
    const name = item.name || path.slice(path.lastIndexOf('node_modules/') + 13);
    if (!/^(@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i.test(name) || typeof item.version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][a-z0-9.+-]+)?$/i.test(item.version) ||
        typeof item.resolved !== 'string' || new URL(item.resolved).origin !== 'https://registry.npmjs.org') throw new Error(`Unsupported dependency: ${name}`);
    packages.set(`${name}@${item.version}`, { package: { ecosystem: 'npm', name }, version: item.version });
  }
  if (!packages.size) throw new Error('No production packages found.');
  return [...packages.values()];
}

export function nativeOutcome(result) {
  let report;
  try { report = JSON.parse(result.stdout); } catch { /* A missing report never passes. */ }
  if (report?.metadata?.vulnerabilities && !report.error) {
    const counts = report.metadata.vulnerabilities;
    if (!['info', 'low', 'moderate', 'high', 'critical', 'total'].every((k) => Number.isInteger(counts[k]) && counts[k] >= 0)) return 'invalid';
    if (counts.critical > 0) return 'critical';
    return result.status === 0 ? 'pass' : 'invalid';
  }
  const unavailable = ['FETCH_ERROR', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'E503', 'E502', 'E504', 'E429'];
  if (result.error?.code === 'ETIMEDOUT' || unavailable.includes(report?.error?.code)) return 'unavailable';
  return 'invalid';
}

export async function auditOsv(queries, request) {
  const ids = new Map();
  let pending = queries;
  for (let page = 0; pending.length; page++) {
    if (page >= 20) throw new Error('OSV pagination limit reached; incomplete audit.');
    const next = [];
    for (let offset = 0; offset < pending.length; offset += 100) {
      const batch = pending.slice(offset, offset + 100);
      const response = await request('/v1/querybatch', { queries: batch });
      if (!Array.isArray(response?.results) || response.results.length !== batch.length) throw new Error('Incomplete OSV response.');
      for (let index = 0; index < batch.length; index++) {
        const row = response.results[index];
        if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some((key) => !['vulns', 'next_page_token'].includes(key)) || (row.vulns !== undefined && !Array.isArray(row.vulns))) throw new Error('Invalid OSV result.');
        for (const vuln of row.vulns || []) {
          if (!vuln || typeof vuln.id !== 'string' || !/^[A-Za-z0-9-]+$/.test(vuln.id)) throw new Error('Invalid advisory identifier.');
          const packages = ids.get(vuln.id) || new Set();
          packages.add(`${batch[index].package.name}@${batch[index].version}`);
          ids.set(vuln.id, packages);
        }
        if (row.next_page_token !== undefined && typeof row.next_page_token !== 'string') throw new Error('Invalid pagination token.');
        if (row.next_page_token) next.push({ ...batch[index], page_token: row.next_page_token });
      }
    }
    pending = next;
  }
  const findings = [];
  if (ids.size > 2000) throw new Error('Advisory limit exceeded; incomplete audit.');
  for (const [id, packages] of ids) {
    const advisory = await request(`/v1/vulns/${encodeURIComponent(id)}`);
    if (advisory?.id !== id || typeof advisory.modified !== 'string' || !Number.isFinite(Date.parse(advisory.modified))) throw new Error('Invalid advisory detail.');
    if (advisory.withdrawn) {
      if (!Number.isFinite(Date.parse(advisory.withdrawn))) throw new Error('Invalid withdrawal timestamp.');
      continue;
    }
    const severity = advisory.database_specific?.severity;
    // Unknown classifications block release rather than being silently treated as low.
    if (!['LOW', 'MODERATE', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(severity)) throw new Error(`Unclassified advisory: ${id}`);
    findings.push({ id, severity, packages: [...packages].sort() });
  }
  return { source: 'OSV', packages: queries.length, findings, critical: findings.filter((v) => v.severity === 'CRITICAL').length };
}

export function createOsvRequest(fetcher = fetch) {
  const deadline = AbortSignal.timeout(240000);
  return async (path, body) => {
    const response = await fetcher(`https://api.osv.dev${path}`, {
      method: body ? 'POST' : 'GET', redirect: 'error',
      headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.any([deadline, AbortSignal.timeout(15000)])
    });
    if (!response.ok) throw new Error(`OSV unavailable: HTTP ${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Empty OSV response.');
    const chunks = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 4 * 1024 * 1024) { await reader.cancel(); throw new Error('OSV response size limit reached.'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  };
}

async function main() {
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error('Run through npm run audit:dependencies.');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const queries = productionPackages(JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8')));
  const result = spawnSync(process.execPath, [npm, 'audit', '--json', '--omit=dev', '--audit-level=critical', '--fetch-timeout=15000', '--fetch-retries=0'], {
    cwd: root, encoding: 'utf8', timeout: 45000, maxBuffer: 8 * 1024 * 1024, windowsHide: true
  });
  const outcome = nativeOutcome(result);
  if (outcome === 'pass') { console.log('npm dependency audit passed at the critical threshold.'); return; }
  if (outcome !== 'unavailable') throw new Error(`npm dependency audit blocked: ${outcome}.`);
  console.log('npm audit service unavailable; performing a fresh OSV production-lockfile audit (not skipping).');
  const request = createOsvRequest();
  const canary = await auditOsv([{ package: { ecosystem: 'npm', name: 'minimist' }, version: '1.2.5' }], request);
  if (!canary.findings.some((v) => v.id === 'GHSA-xvch-5gv4-984h' && v.severity === 'CRITICAL')) throw new Error('OSV critical canary failed.');
  const report = await auditOsv(queries, request);
  console.log(JSON.stringify(report, null, 2));
  if (report.critical) throw new Error('Critical production vulnerabilities found.');
  console.log('OSV fallback audit passed at the critical threshold. Non-critical findings above remain actionable.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
