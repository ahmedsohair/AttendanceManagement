# ExamPulse Exam-Day Runbooks

## Status and Ownership

Prepared 4 September 2026 against source baseline `84c770d`; staging subsequently deployed runtime `e9e41c1`. Automated recovery checks and live alert delivery were exercised on 4 September; see `PHASE_8_REMAINING_ACCEPTANCE.md` for exact evidence and limitations. The full operator/browser rehearsals below are not complete and do not establish Phase 8 acceptance. UI labels and available features must be checked against the deployed revision before exam day.

Incident owner: Ahmed / designated application administrator. Room invigilators report to their room team leader; the owner coordinates technical recovery and reconciliation. Only an authorized administrator may change deployments, credentials, assignments, or exam data. This document grants no permission to perform those changes.

## First Response

1. Tell the room team leader what is affected. If student processing is blocked, begin the manual fallback below rather than repeatedly retrying uncertain writes.
2. Record exam, room, approximate local time with timezone, affected device/browser, visible message, and request ID if available. Establish whether one device, one room, or all rooms are affected.
3. Preserve evidence and queued marks. Do not clear browser/site data, uninstall the browser, switch profiles, or discard queue entries. Do not share codes, tokens, passwords, student lists, or unredacted logs in group chat or Git.
4. The owner checks the actual deployed version and environment before diagnosis. Pause unrelated deployments, imports, code changes, and exam closure while recovery is unresolved.
5. Give staff a concrete next action and next update time. Do not announce recovery solely because a page loads; verify the affected workflow and reconcile uncertain records.

### Environment Boundaries

| Environment | App | Supabase project |
| --- | --- | --- |
| Production | `https://exampulse.xyz` | `mtoyhpyxqhfwhcrysqon` |
| Staging, synthetic data only | `https://exampulse-stagings.vercel.app` | `bjoguceapwquyczbhlyp` |

Staging is NOT a substitute production attendance system. Do not enter real exam data there. Local `.env.local` files were reported to target production: never launch local incident experiments without independently verifying process configuration. An app rollback does not roll back database migrations.

## 1. Scanner or OCR Model Unavailable

**Symptoms:** OCR initialization fails, camera is unavailable, repeated browser crash, or the scanner page will not load.

1. If the page remains usable, use the existing manual student-number lookup and review flow; check the displayed student/room before marking. Manual lookup still requires backend connectivity. It is not a guaranteed fallback for a browser process that crashes before controls appear.
2. For a camera-only failure, check permission and use manual entry. If OCR exposes Retry OCR Load, one controlled retry is reasonable after connectivity returns; do not repeatedly reload while the queue is unresolved.
3. If the entire browser crashes, use another available device for new students or the paper fallback. Pending marks on the original device do not transfer automatically. Keep that device and its browser data for reconciliation.
4. The owner distinguishes page availability, model asset download, initialization, camera access, and lookup/mark API failures using available browser/network evidence. Do not assume every iPhone crash is a network error or that changing browser guarantees a fix.
5. If the model host alone is unavailable, continue manual lookup; do not change model URLs or ship an untested OCR build during the incident.

**Recovery check:** page stays open, manual lookup works, and OCR initializes on representative affected devices. Confirm uncertain attendance against admin records before repeating a mark. Resume OCR without delaying the manual queue.

**Rehearsal pending:** block model downloads in isolated browser testing; verify manual access and retry. Physical iPhone crash/recovery testing remains required. JavaScript error reporting cannot guarantee capture of a killed browser process.

## 2. Database Paused, Degraded, or Unreachable

**Symptoms:** login, room loading, lookup, or marks fail across devices; queued items accumulate; requests time out.

1. Use manual fallback if lookups cannot complete. Do not promise that new students can be fully processed offline: the durable mark queue is not an offline roster database.
2. Keep original device/browser sessions and their queues. A timeout does not prove the server rejected a mark; it may already exist. Do not re-enter the same uncertain mark on another device without checking.
3. The owner inspects the correct Supabase project's availability and service information, plus application errors. Distinguish project pause, connectivity, credentials, quota/resource limits, and an application regression rather than changing secrets speculatively.
4. If the dashboard confirms a pause, the authorized owner can use the provider's supported resume operation. For other causes, follow provider recovery guidance or escalate; no direct table edits or production restore as a first response.
5. After connectivity returns, let existing queued requests retry with their original identity/idempotency information. Inspect failures/conflicts rather than repeatedly pressing Retry.

**Recovery check:** login/room access and read-only lookup work; authorized workflow verification succeeds; queue counts drain or every remaining item has an owner and reconciliation decision. Check exam-specific attendance, not only aggregate totals.

**Rehearsal pending:** controlled network timeout/reconnect with synthetic marks, including a committed response lost in transit. Do not deliberately pause production.

## 3. Deployment or Domain Failure

**Symptoms:** site cannot be reached, TLS/domain error, failed deployment, or client exception following a release.

1. Compare device/network scope and record the exact URL and error. Preserve unresolved device queues before any reload instructions.
2. The owner checks the production project's active deployment, domain configuration, and logs. Do not modify email DNS records or add guessed DNS targets to solve a website problem.
3. If considering the existing production `vercel.app` hostname, first verify that it points to the intended production deployment and backend. Treat it as a different browser origin: login, camera permission, and IndexedDB queue state do not transfer. Retain the original-origin queue for reconciliation.
4. For a confirmed release regression, an authorized owner may restore a known-good compatible deployment using the platform's supported operation. Verify database/API compatibility and environment variables first. Do not bypass a failed dependency gate to deploy an unverified build.
5. If recovery is uncertain, continue paper attendance rather than making simultaneous DNS, code, and database changes.

**Recovery check:** expected deployment and backend confirmed, domain/TLS work, sign-in and lookup verified, and any original-origin pending marks accounted for. Record the deployment change and time.

**Rehearsal pending:** staging-only rollback compatibility and alternate-origin behavior. No live failover rehearsal has been established by this document.

## 4. Email Delivery Failure

**Symptoms:** invigilator reports no email, job fails, bounce/complaint, or delivery status is unknown.

1. Verify the intended recipient and current assignment privately. Inspect the app's delivery report if available in the deployed revision; compare provider event status and timestamps.
2. "Accepted" is not inbox placement. "Delivered" does not prove the user saw the email: recipient filtering/quarantine can still prevent access. Ask them to check junk and, where necessary, institutional IT quarantine.
3. Retry only entries the current UI identifies as failed after resolving the cause. Do not bulk resend accepted/delivered/unknown messages blindly; investigate unknown outcomes first. A fixed sending delay is not a guarantee against filtering.
4. For urgent instructions, send the guide, correct scanner link, exam start time, room, and existing valid code via an approved private channel. Do not put codes in the invigilation group or regenerate solely because an email was missing. If the current code cannot be safely recovered, follow the controlled replacement process rather than guessing it.
5. Treat complaints/bounces as an address/delivery investigation, not permission for repeated attempts. Keep sensitive provider payloads out of shared logs.

**Recovery check:** affected invigilator confirms receipt and correct room access; pending failed/unknown messages are accounted for without unintended duplicates.

**Rehearsal pending:** synthetic failed/unknown/delivered states and private fallback; real test mail only to an explicitly authorized recipient.

## 5. Incorrect Roster Import

**Symptoms:** wrong room/student allocations, missing or duplicate students, inconsistent count versus source files.

1. Stop publication if still a draft. Preserve the original workbook and exported exam data securely. Compare canonical student IDs and their assigned room/zone, not only total row counts.
2. If active, notify room leaders and keep a separate discrepancy record. Do not delete, reimport, or create a replacement active exam while attendance is being recorded without an approved migration/reconciliation plan.
3. Distinguish a summary-display defect from missing allocations using the exam-scoped export and read-only records. Do not rebuild an exam just because one badge looks wrong.
4. For an unused draft, the owner can plan a corrected import through the existing new-exam flow. Import creates a new draft; it is not an established append/repair operation. Verify the replacement before any authorized removal of the old draft.
5. For an active exam, use existing exception handling only under team-leader direction. Missing students require manual evidence and owner review; do not fabricate an allocation or substitute another student's number to get a mark through.

**Recovery check:** expected student-ID set and allocations agree with the approved roster, staff assignments are verified, and every attendance record associated with any superseded exam is reconciled.

**Rehearsal pending:** draft correction and count-versus-content comparison with synthetic workbooks. Active-roster repair is an owner-led exception, not an automated feature promised here.

## 6. Invigilator Code Compromise

**Symptoms:** code disclosed to an unauthorized person or unexplained scanner activity under an invigilator account.

1. Notify the owner privately; preserve the time, affected account, suspected exposure, and relevant audit evidence. Never repeat the code in the incident log.
2. The owner uses the existing generate/activate flow to replace the exposed credential, then privately supplies the new active code to the legitimate invigilator. A generated pending code is not a completed security response; complete the intended activation and verify old-code rejection for new sign-ins.
3. **Existing signed-in scanner sessions remain active after code activation.** Rotation alone does not contain a stolen session. Escalate to an authorized operator to assess supported session revocation and its effect on legitimate pending marks. No tested one-click full-session revocation runbook is established here.
4. Review affected attendance/incident activity. Do not delete suspicious records or the user to erase evidence; reconcile through an approved audited process. Tell the legitimate invigilator when reauthentication is required.

**Recovery check:** new-sign-in credential exposure contained, existing sessions explicitly assessed/contained, legitimate staff access restored, and suspicious records reviewed. Do not close the incident merely because a new code was emailed.

**Rehearsal pending:** disposable-account rotation and session behavior. Full session containment remains an explicit operational gap requiring a verified procedure before this runbook can be accepted.

## 7. Pending Marks After Exam Closure

**Symptoms:** queue shows "Conflict needs review" or "Could not synchronize" after closure.

1. Before planned closure, ask room leaders to confirm queue reconciliation on every device. A single admin total cannot show all device-local pending marks.
2. If already closed, keep the same device/browser/account. Inspect Attendance sync queue and capture the minimum necessary details securely: student, exam, room, local attempt time, status, and request ID if available.
3. Compare each item with admin attendance. A mark may have committed before a response was lost; distinguish that case from an absent record. A wrong-room or closed-exam conflict is not a transient network failure.
4. Use Retry only after a retryable underlying cause is resolved. Do not reopen an exam, change its date, bypass validation, or construct a fresh request solely to force a queued mark through.
5. **Acknowledge removes the unresolved local queue item; it does not mark attendance.** Use it only after the owner has verified the record or secured the evidence and approved its reconciliation disposition. Otherwise leave the item intact.
6. Missing attendance after closure requires an approved reconciliation process. This document does not claim the app supports post-closure marking or bulk repair.

**Recovery check:** every queue item matched to an existing record or documented owner-approved reconciliation outcome; no unresolved evidence discarded. Owner signs off before devices are cleared.

**Rehearsal pending:** closed-exam conflict, committed-but-response-lost case, Retry, and Acknowledge using disposable fixtures.

## 8. Manual Fallback and Reconciliation

Use an institution-approved paper sheet or secure institutional document, not public spreadsheets or repository files. Record only the information necessary for attendance: exam/date, student number, room, zone if relevant, check time and timezone, invigilator identity, identity-check method/comment where needed, and team-leader exception decision. Avoid photos of student IDs unless separately required and authorized by institutional procedure.

1. Announce the fallback start time and affected rooms. Distinguish "recorded manually" from "saved in ExamPulse." Keep paper records separate from uncertain queued electronic marks.
2. When service returns, the owner compares manual entries against exam-specific attendance and device queues before replaying anything. Deduplicate by exam/student, not name or timestamp alone.
3. If the exam remains active, approved entry uses the normal authorized workflow. Preserve the original observed time in the reconciliation evidence: later entry time is not the original attendance time. Do not modify database timestamps to disguise that distinction.
4. If the exam is closed or allocations are disputed, escalate for approved reconciliation; do not claim a supported bulk import/backdated-entry feature exists.
5. Keep a reconciliation register with source record, existing/new system record reference where available, action taken, unresolved reason, reviewer, and review time. Match totals AND student-ID sets; investigate mismatches individually.
6. Room leader and owner confirm completeness. Store and dispose of fallback records under institutional policy; no invented retention period.

**Recovery check:** no unexplained missing or duplicate attendance, exceptions retained, pending queues resolved, and owner sign-off recorded.

**Rehearsal pending:** mixed paper/queued/committed records and closed-exam reconciliation tabletop. Use synthetic data only.

## Backups and Escalation

Repository utilities: `scripts/backup-supabase.ps1` creates a logical backup; `scripts/restore-supabase-staging.ps1` is for staging, not an approved production-restore tool; `scripts/validate-supabase-integrity.ps1` performs relational validation. Operators must inspect target parameters and required environment variables before authorized use. Do not paste connection strings into incident reports.

Restore is not an exam-day first response: it can overwrite newer attendance and may not restore every external service asset. Verify backup contents, target, recovery point, and reconciliation impact in an isolated environment before a separately approved recovery. A past checksum or matching count is not a guarantee of complete production disaster recovery.

## Incident Record and Rehearsal Register

For each incident record: owner; environment/deployment; start/end time with timezone; affected rooms/devices; redacted symptoms/request IDs; fallback announced; actions and approvals; unresolved queues; reconciliation reference; recovery evidence; follow-up owner. Keep sensitive evidence in approved restricted storage, not this repository.

| Runbook | Source reviewed | Controlled rehearsal | Remaining acceptance |
| --- | --- | --- | --- |
| Scanner/OCR | Yes | Not run here | Model outage and physical crash/recovery |
| Database | Yes, queue boundaries | Not run here | Reconnect and uncertain commit |
| Deployment/domain | Environment boundaries documented | Not run here | Compatible rollback and origin isolation |
| Email | Yes, job status/retry UI | Not run here | Failure handling and recipient fallback |
| Roster | Import/operational boundaries documented | Not run here | Synthetic correction/reconciliation |
| Code compromise | Yes, activation warning | Not run here | Verified existing-session containment |
| Post-closure queue | Yes, Retry/Acknowledge controls | Not run here | Closed conflict and evidence preservation |
| Manual fallback | Procedure drafted | Not run here | Tabletop and institutional approval |

No production infrastructure or business data was modified while preparing these runbooks. The dashboard, alert-check pipeline and client telemetry are now implemented locally; activation and controlled alert-firing instructions are in `PHASE_8_ACTIVATION.md`. Local automated tests do not replace the controlled rehearsals listed above. Existing-session containment and operator/institutional sign-off remain outstanding.
