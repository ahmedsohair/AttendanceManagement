# Dependency release gate

The release threshold remains **critical production vulnerabilities**, including transitive and optional packages across the repository's workspaces. Passing this gate does not mean every dependency is vulnerability-free.

Run `npm.cmd run audit:dependencies` locally and `npm run audit:dependencies` in CI. Unit tests: `npm.cmd run test:audit`.

## Failure behavior

1. Run native npm audit with JSON output, a bounded request timeout, and no repeated network retry loop. A valid report with critical findings blocks release. Invalid reports and non-network failures also block release.
2. Only when npm fails with a recognized network/service error or times out, query the live OSV API for every unique production registry-package version in `package-lock.json`. This is another vulnerability check, not an audit skip.
3. Verify OSV detects the known critical `minimist@1.2.5` canary before using its fallback results. Follow all batch pagination, retrieve complete advisory details, and fail on missing results, malformed responses, unsupported dependency sources, unclassified severity, response-size limits or deadlines.
4. Critical OSV findings block release. Other severities are reported and require separate triage. No `continue-on-error`, `|| true`, cached clean report or package exemption is used.

OSV is an independent advisory aggregator; coverage and severity metadata can differ from npm. The fallback uses its `database_specific.severity`, rejects unknown classifications, and includes locked optional packages regardless of the runner platform. Known local workspace links are not registry packages; their nested registry dependencies are still included. Development-only dependencies remain outside the existing production gate.

Only registry package names and versions are sent to OSV. No source files, credentials, application configuration or student data are sent. Protocol: [OSV API](https://google.github.io/osv.dev/api/), [batch ordering and pagination](https://google.github.io/osv.dev/post-v1-querybatch/). Native behavior: [npm audit](https://docs.npmjs.com/cli/v10/commands/npm-audit/).

## Evidence: 4 September 2026

- Ordinary npm registry requests succeeded while both bulk and legacy audit POST requests timed out, including an empty payload and a single-package payload. This excludes the project's dependency-tree size as the sole explanation; it does not establish the exact upstream cause.
- A subsequent bounded native npm audit returned a valid report and passed the critical threshold.
- Independent live OSV verification checked **781 distinct production package/version pairs**, representing 1,019 lockfile entries. It reported **zero critical and 25 non-critical advisories**.
- Five local gate tests passed: package inventory, native result classification, pagination/deduplication, incomplete/unknown responses and HTTP/JSON failure handling.

Outstanding non-critical advisory families: `protobufjs`, `brace-expansion`, `uuid`, `postcss`, `@xmldom/xmldom`, `nanoid`, `@babel/core`, `ws`, `js-yaml`, `browserslist`, `image-size`, `shell-quote`, and `sharp`. Some affect the native/build dependency tree rather than the deployed web runtime; reachability is not established here. They are **not dismissed**. Triage runtime exposure and compatible fixes separately before production rollout; do not apply a broad `npm audit fix --force` during monitoring activation.

No dependency versions changed in this audit-runner update. GitHub/Vercel release checks must still pass for the pushed commit before staging promotion is considered verified.

## Scanner trial release gate - 18 October 2026

- The runtime-only staging trial `e13c1cc` failed the critical gate. A fresh native
  report confirmed critical advisory groups for `next@15.5.21` and
  `shell-quote@1.8.4`; these were not registry timeouts.
- Companion patch: Next.js 15.5.28 (same 15.5 release line), matching env/SWC
  packages, and a root override for shell-quote 1.11.0. No broad audit-fix or
  scanner-library version change. See `SCANNER_SAFARI_WASM_TRIAL.md` for scope,
  verification and release status.
- Initial patched-lock audit: zero critical, 33 high, 12 moderate and 1 low.
  Passing the critical threshold does not close the remaining advisory triage.
- Advisory references:
  https://github.com/advisories/GHSA-p293-qw3h-jr36
  https://github.com/advisories/GHSA-2xp9-vwfh-vxw4
  https://github.com/advisories/GHSA-pqg4-j6r4-53mv
