# Staff Guide Maintenance

Updated 25 October 2026 for production runtime `5fddf53`.

## Editable Sources and Outputs

- `docs/INVIGILATOR_GUIDE.md`: plain-language invigilator quick guide; two deliberately separated pages.
- `docs/COORDINATOR_GUIDE.md`: administrator handover and exam-day checklist; three pages.
- `scripts/build-user-guides.py`: builds both PDFs and matching portable TeX sources from those Markdown files. Requires Python with ReportLab; no environment files or network calls are used.
- `output/pdf/exampulse-invigilator-guide.pdf` and `output/pdf/exampulse-coordinator-guide.pdf`: shareable copies.
- `apps/admin/src/lib/assets/exampulse-invigilator-guide.pdf`: attachment used by assignment emails after a deployment containing the updated asset.
- `docs/exampulse_invigilator_instructions_overleaf.tex` and `docs/exampulse_coordinator_instructions_overleaf.tex`: generated, self-contained text-only sources for optional Overleaf editing. Regeneration overwrites these; edit Markdown first. PDF output is rendered with ReportLab, not compiled from TeX; the TeX layout is an alternative, not a pixel-identical copy.

From the repository root, run:

```powershell
python scripts/build-user-guides.py --update-email-attachment
```

The small Markdown subset supports paragraphs, `#`/`##` headings, bold, links, bullet/numbered items and `<!-- pagebreak -->`. Review each PDF page after regeneration and check for unexpected spill pages or clipped content. The invigilator PDF should remain two pages and the coordinator PDF three pages; adjust explicit breaks and content if necessary.

## Content Decisions

- New staff must receive a code separately; account creation does not prove email receipt. Returning staff keep their active code unless it is replaced. Assignment email does not include a new code.
- A generated replacement is pending; only activation invalidates the old code for new sign-ins. Existing sessions are not revoked by replacement.
- Early model download is not early camera access or full model initialization. Loading estimates are not guaranteed timings. Manual lookup still needs connectivity.
- At the owner's request, invigilator-facing instructions omit environment names, model downloads, setup-stage explanations and implementation details. They focus on staff actions, recognizable button labels and who to ask for help. Technical guidance stays in the coordinator guide and runbooks; the invigilator PDF footer also omits the environment label.
- Pending/failed/conflict guidance is conditional recovery advice, not an extra normal-workflow step. Preserve queues; do not acknowledge unresolved attendance merely to remove a warning.
- The revised PDFs intentionally omit old screenshots that show superseded controls and loading UI. Current button labels and short, text-led steps avoid teaching the wrong interface. Historical images remain untouched in `docs/screenshots/guide/`.
- The coordinator PDF is handed over separately. It is not automatically attached to invigilator emails and contains no credentials, roster data, or environment secrets.
- Assignment and access-code email copy is in `apps/admin/src/lib/invigilator-instruction-email.ts`. Keep its plain-text and HTML variants aligned with the guides. Email stream tests must not contact real recipients.

## Release Boundary

Preparing these guides does not send email, update previously delivered attachments, deploy application changes, or authorize exam/data/credential mutations. New bundled attachments and email wording only take effect after a separately authorized deployment. Previously sent emails retain their old PDFs; distribute the revised PDF through the institution's approved channel if needed.

Readiness is not certified by the guides: phone/connection checks, roster verification and institutional identity/exception procedures still belong to the exam team. See `EXAM_DAY_RUNBOOKS.md` for detailed technical escalation and reconciliation.

## Verification on 25 October 2026

- The revised invigilator PDF contains two pages; the coordinator PDF remains three pages. The coordinator pages were previously rendered and checked, and both simplified invigilator pages were re-rendered with Poppler and visually checked for readable text, correct page breaks, and no clipping or overflow. Text checks confirm that the invigilator PDF, including its footer, contains no staging/production terminology or model/engine explanations.
- Text checks cover code onboarding/reuse, actual recovery and review labels, assignment/email actions, export and closure. PDF hyperlinks are present, and the shareable invigilator PDF matches the bundled email attachment byte-for-byte.
- Both original generated TeX sources compiled successfully using the desktop editor's built-in compiler. The simplified invigilator TeX was regenerated from Markdown, but its follow-up compiler request did not finish and was stopped. Its optional TeX compilation remains unverified; the delivered PDF was generated independently with ReportLab and visually verified. Neither source depends on the old screenshots.
- All eight email transport tests passed, including the new plain-text/HTML wording assertions. Tests used synthetic recipients and stream-only delivery; no real email was sent. The main checkout still has older local dependencies, so the test source and email module were read from this checkout while Nodemailer 10.2.1 and TypeScript were resolved from the existing isolated `C:/dev/exampulse-ops-release-20261024` dependency checkout. Nothing was installed or overwritten there.
- `.gitattributes` marks PDF files as binary to prevent Windows line-ending conversion from corrupting them. Application logic, dependency versions, hosted settings and business data are unchanged.
