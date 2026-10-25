# Coordinator Exam-Day Guide

Updated 25 October 2026. For an authorized coordinator operating the existing ExamPulse administrator dashboard.

## 1. Prepare Your Handover

Sign in at [exampulse.xyz/login](https://exampulse.xyz/login). Give invigilators [exampulse.xyz/scan](https://exampulse.xyz/scan), not the administrator password. Never collect real attendance in staging.

- Agree with Ahmed which exam you will run, who approves exceptions, who can provide technical help, and how to reach the room Team Leaders while he is away.
- Obtain administrator access privately. Current administrator access is broad, not limited to your course; do not edit other coordinators' exams, accounts, or assignments.
- Have the approved roster, room list, staff list, a tested spare phone, and the approved paper-attendance fallback ready.
- Read the Invigilator Guide. Rehearse sign-in, scanning, manual lookup, and room selection on the phones staff will use. Use a clearly labeled synthetic test exam for test marks, not real students.

## 2. Import and Check the Exam

1. Open **Add New Exam**. Enter the exam name, date, and local start time carefully.
2. Upload the approved **.xlsx** or **.csv** roster file(s). Use the displayed template: **student_id**, **student_name**, **room**, **zone**; **course_code** and **program** are optional. Keep student numbers as text to preserve leading zeros.
3. For Excel, place the roster on the first worksheet. Duplicate student IDs within the same import are rejected; correct the source rather than inventing new IDs.
4. Check the import summary against the source roster: student count, room count, and room/zone values. Import creates a **Draft**, not a live exam.

**Check content, not just totals:** verify representative student IDs and their room/zone assignments against the approved roster. If the dashboard does not expose enough detail, use **Export XLSX** and compare the relevant sheets. Resolve discrepancies before publishing.

Do not re-import a published exam to repair it during attendance collection. Escalate an active-roster problem to Ahmed. Deleting a draft is destructive and is not a routine troubleshooting step.

## 3. Arrange Personal Access Codes

**New invigilator:** create the person using **Invigilators > Create Invigilator**, or **Add New Invigilator** in exam setup. Confirm their name and email first. Copy/share the newly displayed code privately or select **Email Code** before leaving the code display. Creation does not automatically prove that the code has been emailed or received.

**Returning invigilator:** reuse their existing active code. Creating an exam or sending assignment details does not reset it. Ask them to find their earlier **ExamPulse access code** email and test sign-in.

<!-- pagebreak -->

## 4. If a Code Has Been Lost

The app stores active codes as secure hashes; it cannot display or resend an old code after its one-time display has gone. There is no self-service recovery yet.

1. Verify the staff member's identity and email through your approved private process.
2. In **Invigilators**, open their **Access code** action and choose **Generate Replacement Code**.
3. Generating creates a pending replacement. The old code still works until you select **Activate Code** and confirm.
4. Activation stops the previous code working for new sign-ins. Immediately copy/share the new code privately or use **Email Code** while it is displayed. Confirm the person can sign in with it.

Do not replace codes merely to send assignment reminders. Replacement does not sign out existing scanner sessions. If a code or session may have been stolen, contact Ahmed for the security response; code replacement alone is not complete containment.

## 5. Assign Rooms, Save, and Publish

1. In the exam setup, select each room and add the intended invigilator(s). Creating someone in the wizard only stages their assignment; it still needs saving.
2. Use **Save Draft**. Check the **Review & Publish** summary for every roster room and the correct staff. Do not assume one total proves every room is covered.
3. When the roster and assignments are correct and you intend staff to access the exam, select **Publish Exam** (or **Save & Publish Exam** when edits remain). Confirm the exam shows **Active**.
4. Publishing enables access; the displayed exam date/time is not a substitute for the Active status. Draft and Closed exams are not available as active scanner rooms.
5. For later staffing corrections, open the Active exam's **Invigilator Assignments**, edit only the intended exam, and select **Save Changes**. Saved access changes apply immediately.

If a concurrent-edit warning appears, review the newer staffing snapshot before saving again. Do not overwrite another coordinator's work blindly.

## 6. Send Instructions and Verify Receipt

After saving assignments, choose **Email Invigilators** and confirm the send. Keep the page open while the email job processes and inspect **Email delivery status**.

- Assignment emails contain the exam, rooms, scanner link, and Invigilator Guide. They do **not** contain a new personal access code. Send new or replacement codes separately using **Email Code**.
- **Accepted** means the email provider accepted the message, not that it reached the inbox. Ask staff to confirm receipt, check spam if needed, and test their code and room selection.
- Review failures individually. Use **Refresh Status** and **Retry Selected Failed** where available; do not repeatedly send the whole batch. An unknown outcome is not proof that nothing was sent. Escalate uncertain delivery and use an approved private handover if needed.

Avoid bulk resends immediately before the exam. Keep codes out of group chats, shared roster files, and screenshots.

<!-- pagebreak -->

## 7. Final Check and Live Operation

Before attendance starts, confirm the correct exam is Active, each room has coverage, staff can sign in, and scanner or manual lookup works on their actual phones. Keep the spare device and paper fallback available.

Open the specific exam; dashboard totals include other Active exams. Use its **Attendance Marked**, **Mismatch Present**, and **Incidents** links. Check exam filters on the main Attendance and Incidents pages.

Wrong-room decisions belong to the Team Leader under the institution's rules. A redirection does not mark attendance; a wrong-room present mark is flagged and does not change the official allocation. Refer students missing from the roster to the authorized exam team; do not substitute another student's number.

**Health alerts:** check the named environment and capture time on **Health**. Select **Refresh metrics** for a new snapshot. A staging warning is not a production-outage diagnosis. Health cannot account for every phone's unsynced marks. Investigate repeated production warnings or staff-facing errors.

## 8. Only If Connectivity or Submission Fails

Pending/failed items are recovery states, not expected extra work for every invigilator. Ask the affected person to keep the original phone, browser session, and site data.

1. Record the exam, room, time, visible message, and whether other devices work. Keep credentials and student lists out of group chat.
2. If only camera/OCR fails, use manual lookup. If the backend or entire browser is unavailable, use the approved paper fallback or a tested spare phone for new students.
3. Inspect the phone's **Attendance sync queue**. Let pending items synchronize after connectivity returns. Compare uncertain/failed/conflict items with this exam's server attendance before repeating a mark.
4. **Acknowledge** removes the local queued item; it does not create or repair attendance. Use it only after reconciliation and an authorized decision. Preserve any remaining exception for follow-up.

Manual lookup still needs connectivity. The dashboard cannot inventory every offline phone's queue. Do not clear browser data, restore the database, change deployments, or close the exam as a quick fix. Escalate unresolved problems to Ahmed and follow **EXAM_DAY_RUNBOOKS.md**.

## 9. Finish, Reconcile, Export, Then Close

1. Ask every room Team Leader to confirm collection is finished and any device-local queue or paper record is resolved or explicitly accounted for. If an unresolved item remains, do not close until Ahmed approves the reconciliation plan.
2. Review this exam's attendance, wrong-room marks, and incidents. Reconcile paper and uncertain records by student ID, not only by total count.
3. Select **Export XLSX** and check the file is readable and belongs to the correct exam. Store it in the institution's approved secure location; do not circulate unneeded student data.
4. Only then choose **Close Exam** for this exam and confirm. Verify **Closed** and retain a final export. Closure removes active room access and can cause outstanding submissions to conflict. No self-service reopen is promised.

Leave other exams and old tests unchanged. Sign out when finished. Support: [ahmed.sohair.khan@rmit.edu.au](mailto:ahmed.sohair.khan@rmit.edu.au). Agree a backup contact before Ahmed travels.
