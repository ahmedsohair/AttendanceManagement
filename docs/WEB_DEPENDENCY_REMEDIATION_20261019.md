# Web dependency remediation - 19 October 2026

## Scope and owner decision

The owner explicitly required dependency findings fixed before public release.
No advisory exception, suppression, `audit fix --force`, production migration or
deployment is part of this change. Deferred native Expo/React Native findings
remain outside this web release; they are not certified fixed by a web-only audit.

Fresh web production audit command:

```text
npm audit --workspace @algo-attendance/admin --omit=dev --json
```

Before: 11 affected package groups, 7 high and 4 moderate, no critical findings.
After the selected updates: zero reported web production vulnerabilities across
all severities. This is a current registry result, not proof of no unknown issues
or an audit of every native workspace or the entire final deployment artifact.
Ignored raw before/after reports are under `test-results/` in the independent
security checkout; no secret or business-record values are included.

## Selected fixes

| Web path | Change and compatibility boundary |
| --- | --- |
| Nodemailer | 9.0.5 to 10.0.9, explicitly pinned. The initially considered 10.0.6 still matched a newer recipient-parser advisory; it is not the selected release. Node 22 is retained. Actual MIME/stream transport tests exercise application email generation without delivery. |
| Next/PostCSS | Next remains 15.5.28. Override its exactly pinned PostCSS 8.4.31 with 8.5.23. This intentionally crosses Next's exact child pin, not the PostCSS major, and requires clean install/build verification. |
| CSS leaves | Scoped PostCSS dependencies resolve Nanoid 3.3.18 and source-map-js 1.2.2. Other native/workspace copies may resolve newer compatible patch versions. |
| Next/Sharp | Sharp 0.34.5 to 0.35.5, supported by Next's existing optional dependency range; associated platform/libvips packages follow the new Sharp release. |
| ExcelJS/UUID | ExcelJS remains 4.4.0. Override UUID 8.3.2 with CommonJS-compatible 11.1.1. Source inspection found ExcelJS's conditional-formatting code uses `v4`; a workbook data-bar write/read test exercises that path. This is an intentional transitive major override, not an ExcelJS downgrade. |
| ExcelJS/glob | Scoped brace-expansion 1.x/2.x copies use 1.1.21/2.1.7. Other compatible workspace copies also advanced during lock resolution. |
| Browser OCR | PaddleOCR remains 0.3.2 and ONNX Runtime Web remains 1.26.0, both constrained to preserve the scanner runtime. Patched parser leaves are js-yaml 4.3.2 and protobufjs 7.6.6. No OCR model, WASM execution provider, camera or attendance logic changed. |

Primary references: [Nodemailer recipient-parser fix](https://github.com/advisories/GHSA-g57g-f23g-4646),
[UUID bounds advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq),
[PostCSS source-map fix range](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp),
[Sharp/libvips advisory](https://github.com/advisories/GHSA-f88m-g3jw-g9cj).
The complete earlier advisory inventory is in `DEPENDENCY_EXPOSURE_20261019.md`;
that report is a historical baseline, not the selected versions above.

## Reproducible installation and regression gate

The host's npm 10.9.4 silently retained vulnerable PostCSS/UUID versions across
workspace links despite valid root overrides. npm 11.21.1 did not correct those
existing paths. npm 12.2.1 plus targeted parent resolution produced the intended
patched tree. This matches the upstream [workspace override bug and fix](https://github.com/npm/cli/issues/9659).
No global Node/npm installation was changed.

- `packageManager` records npm 12.2.1; CI explicitly installs with that version.
- CI uses Node 22.22.2, satisfying npm 12's runtime requirement. The Vercel admin
  package specifies Node 22.x; the deployed platform patch must meet npm's
  `^22.22.2` requirement. Do not bypass an engine/install failure.
- `apps/admin/vercel.json` explicitly installs with npm 12.2.1 and
  `--prefix ../..`, selecting the admin workspace plus root tooling rather than
  installing the separate native app. It assumes the existing Vercel Root
  Directory is `apps/admin`;
  verify that project setting before rollout. Do not reuse the command from a
  different root directory without adjusting and verifying it.
- `audit:web` fails closed for any reported severity, malformed/inconsistent
  reports, transport failure and nonzero/unknown exits. It has no skip-on-error
  fallback. The existing all-workspace critical audit/OSV path remains intact.
- CI now runs both the zero-finding web audit and the existing critical gate.
- Added tests cover SMTP headers/attachments/error semantics and the quoted
  recipient-parser regression, CSS/source maps, Sharp image round-trip, ExcelJS
  UUID/data-bar round-trip, OCR YAML/protobuf compatibility, and release installer
  configuration. These are not real email delivery or physical OCR acceptance.
- npm 12's clean install blocked the unapproved protobufjs postinstall hook.
  It remains unapproved: parser tests and the clean build succeed without it.
  Do not globally permit dependency scripts just to remove that warning.

## Verification checkpoint

- Zero-finding web audit: passed after final override resolution.
- Existing all-workspace critical gate: passed.
- Audit-parser tests: 9 passed.
- Full web suite: 106 passed, including the new compatibility/SMTP/installer
  coverage, in the clean source export as well as the populated security checkout.
- Clean isolated web/root npm 12 install, type-check and Next production build:
  passed using Node 22.22.2. No environment files or saved browser state were
  copied into the export. The earlier full-native-workspace install experiment
  was interrupted, not counted as a pass; the final web-scoped install added
  200 packages and completed successfully.
- Rehearsal/helper tests: 15 passed after adding revision/lock guards.
- Independent bounded source review: no concrete regressions identified; that
  review did not itself install/build or certify hosted behavior.
- Hosted CI/staging smoke checks and production upgrade: not performed by this
  local checkpoint.

The old application-fallback rehearsal used the old dependency lockfile. Do not
claim it certifies this new dependency tree or silently deploy the vulnerable old
fallback. The private helper now accepts paired `--candidate-ref`/`--fallback-ref`
arguments and rejects a working lock/dependency declaration different from the
candidate. Select and verify a compatible patched fallback before public cutover.
