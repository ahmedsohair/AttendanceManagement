# Scanner prefetch rollback - 19 October 2026

## Current state

Production has been rolled back to the previously working `5e2c182` deployment
`6W36WRbULxgjx8GysDnHrstpZz4j`. No database restore, attendance/account change,
credential change or email was performed. Do not clear browser site data/outbox.

Vercel Instant Rollback completed and the public /scan HTML references the old
bundle `/_next/static/chunks/app/scan/page-0a05b1a0ed768cc9.js`. That bundle retains
the loading panel and does not contain the new prefetch helper. The failed
deployment `738d522` / `CDshdyXMEcKY7AuT1sd1Pysud4Z1` is retained as incident
evidence, not approved for re-promotion.

GitHub main still points to `738d522`: rollback reassigns production domains, not
Git history. Vercel explicitly states automatic production promotion is stopped
until rollback is removed. Keep that protection in place; do not resume it or
promote a new candidate without revalidating the real scanner startup.

## Report and confirmed cause

The owner reported immediate Scanning unavailable / manual-entry guidance after
the prefetch release and said Retry could not be used. The exact device/button
disabled state was not captured. Do not claim the literal disabled-button cause
has been independently reproduced.

The immediate initialization rejection was independently reproduced against the
actual installed PaddleOCR 0.3.2 SDK, without network/model initialization:

`text_detection_model_dir requires text_detection_model_name.`

The candidate passed explicit textDetectionModelAsset/textRecognitionModelAsset
overrides but no matching explicit model names. The library's configuration
resolver rejects this combination before model loading, even when lang and
ocrVersion are supplied. Retrying the same configuration cannot succeed.

The application's prior factory test mocked PaddleOCR.create and accepted the
invalid options. The URL/default-source compatibility test and read-only review
did not exercise the actual SDK configuration resolver. Hosted build/unit gate
success was therefore insufficient to validate scanner startup. This was an
application integration error, not evidence of a phone/network failure.

## Local correction, not redeployed

Remove the unnecessary explicit asset overrides. Keep the custom fetch hook;
the existing en/PP-OCRv5 defaults resolve to exactly the two prefetched mobile
assets. No model/accuracy, auth, attendance, camera or timeout change is needed.

Three regression checks now use the actual SDK with initialize:false:

- Reproduce the rejected asset-only configuration, without downloading models.
- Run the actual application's worker factory options through the real SDK's
  validator, verifying default model selection, asset URLs and injected fetch.
- Exercise immediate configuration failure and subsequent retry through the
  actual startup functions; the loading guard and error clear correctly.

These are real configuration/resolution tests, not full OCR inference or proof
that the owner's physical Retry-button report is resolved. The corrected source
remains local; production continues to serve the non-prefetch working release.

## Evidence and next acceptance

- Actual SDK reproduction and the 26-test startup suite passed locally.
- Full corrected candidate suite: 159 passed, zero failed (shared 14, API 31,
  server-unit 31, scanner 83). Next.js production build, lint/types and static
  generation passed. Mirrored candidate files matched the main checkout hashes.
- Full web/build logs are in the independent dependency checkout under
  `test-results/ocr-preparation-20261019/prefetch-incident-tests.log` and
  `prefetch-incident-build.log`.
- Ignored rollback screenshot in the main checkout:
  `test-results/production-cutover-20261019/prefetch-rollback.jpg`.
- Before another deployment, run the full browser OCR startup with synthetic
  data/camera or a dedicated staging device, including actual model/session
  creation, immediate failure/retry, manual entry, and cold/warm/page-exit cases.
  Do not equate initialize:false configuration tests with this acceptance.
- Ask the owner to reopen https://exampulse.xyz/scan to discard the failed page's
  in-memory code and verify the original scanner again. Preserve persisted queues.

Do not make further production mutations merely to collect better evidence.
