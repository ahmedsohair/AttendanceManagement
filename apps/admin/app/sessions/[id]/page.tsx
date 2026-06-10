import Link from "next/link";
import { buildExamSessionReport, getExamSessionStatus } from "@algo-attendance/shared";
import { CloseIcon, DownloadIcon, TrashIcon } from "@/components/action-icons";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { ExamAssignmentWizard } from "@/components/exam-assignment-wizard";
import { formatAuditTime } from "@/lib/audit-time";
import { requireAdminPageUser } from "@/lib/auth";
import { readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function SessionDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    message?: string;
    error?: string;
    q?: string;
  }>;
}) {
  await requireAdminPageUser();
  const { id } = await params;
  const notices = (await searchParams) || {};
  const searchTerm = (notices.q || "").trim().toLowerCase();
  const store = await readStore();
  const session = store.examSessions.find((item) => item.id === id);

  if (!session) {
    return <div className="card">Exam session not found.</div>;
  }

  const sessionStatus = getExamSessionStatus(session);
  const report = buildExamSessionReport(store, id);
  const sessionRooms = store.rooms
    .filter((room) => room.examSessionId === id)
    .sort((left, right) => left.code.localeCompare(right.code));
  const invigilators = store.users
    .filter((user) => user.role === "invigilator")
    .sort((left, right) => left.fullName.localeCompare(right.fullName));
  const roomMap = new Map(store.rooms.map((room) => [room.id, room]));
  const userMap = new Map(store.users.map((user) => [user.id, user]));
  const allocationByStudentId = new Map(
    store.studentAllocations
      .filter((allocation) => allocation.examSessionId === id)
      .map((allocation) => [allocation.studentId, allocation])
  );
  const attendanceRows = report.attendance
    .map((event) => ({
      event,
      allocation: allocationByStudentId.get(event.studentId),
      markedInRoom: roomMap.get(event.markedInRoomId),
      expectedRoom: roomMap.get(event.expectedRoomId),
      markedBy: userMap.get(event.markedByUserId)
    }))
    .filter((row) => {
      if (!searchTerm) {
        return true;
      }

      return (
        row.event.studentId.toLowerCase().includes(searchTerm) ||
        (row.allocation?.studentName || "").toLowerCase().includes(searchTerm)
      );
    })
    .sort((left, right) => right.event.createdAt.localeCompare(left.event.createdAt));

  return (
    <div className="stack">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">Dashboard</Link>
        <span>/</span>
        <Link href="/sessions">Exams</Link>
        <span>/</span>
        <span>{session.name}</span>
      </nav>

      <div className="card">
        <div className="inline-actions" style={{ justifyContent: "space-between" }}>
          <div>
            <div className={sessionStatus === "active" ? "pill ok" : "pill"}>
              {sessionStatus === "active"
                ? "Active"
                : sessionStatus === "closed"
                  ? "Closed"
                  : "Draft"}
            </div>
            <h2 className="section-title" style={{ marginTop: 14 }}>
              {session.name}
            </h2>
            <div className="subtle">
              {session.examDate} | {session.startTime}
            </div>
          </div>
          <div className="inline-actions session-actions">
            {sessionStatus === "active" ? (
              <form action={`/api/exam-sessions/${session.id}/close`} method="post">
                <ConfirmSubmitButton
                  className="button secondary"
                  message="Close this exam? Invigilators will no longer see it as active."
                >
                  <CloseIcon />
                  <span>Close Exam</span>
                </ConfirmSubmitButton>
              </form>
            ) : null}
            <a
              className="button secondary"
              href={`/api/reports/${session.id}/export`}
              title="Export XLSX"
            >
              <DownloadIcon />
              <span>Export XLSX</span>
            </a>
            <form action={`/api/exam-sessions/${session.id}/delete`} method="post">
              <ConfirmSubmitButton
                className="button danger"
                message="Delete this exam and all related rooms, allocations, attendance, and incidents? This cannot be undone."
              >
                <TrashIcon />
                <span>Delete</span>
              </ConfirmSubmitButton>
            </form>
          </div>
        </div>
      </div>

      <div className="grid">
        <Link className="card metric-card" href={`/attendance?examSessionId=${session.id}`}>
          <div className="subtle">Attendance Marked</div>
          <div className="metric">{report.attendance.length}</div>
        </Link>
        <Link className="card metric-card" href={`/mismatches?examSessionId=${session.id}`}>
          <div className="subtle">Mismatch Present</div>
          <div className="metric">
            {report.attendance.filter((item) => item.roomMismatch).length}
          </div>
        </Link>
        <Link className="card metric-card" href={`/incidents?examSessionId=${session.id}`}>
          <div className="subtle">Incidents</div>
          <div className="metric">{report.incidents.length}</div>
        </Link>
      </div>

      {notices.message ? <p className="pill ok toast-message">{notices.message}</p> : null}
      {notices.error ? <p className="pill warn toast-message">{notices.error}</p> : null}

      {sessionStatus === "draft" ? (
        <ExamAssignmentWizard
          initialInvigilators={invigilators}
          mode="setup"
          rooms={sessionRooms}
          sessionId={session.id}
          sessionName={session.name}
          sessionStatus={sessionStatus}
        />
      ) : (
        <details className="card disclosure-card room-access-panel">
          <summary>
            <span>
              <span className="kicker">Room Access</span>
              <span className="section-title summary-title">
                {sessionStatus === "closed"
                  ? "Historical Invigilator Assignments"
                  : "Invigilator Assignments"}
              </span>
              <span className="subtle">
                {sessionStatus === "closed"
                  ? "View staff-room access for this closed exam."
                  : "Manage staff-room access for this active exam. Changes apply immediately after saving."}
              </span>
            </span>
            <span className="pill">
              {invigilators.filter((invigilator) =>
                invigilator.assignedRoomIds.some((roomId) =>
                  sessionRooms.some((room) => room.id === roomId)
                )
              ).length} assigned
            </span>
          </summary>
          <ExamAssignmentWizard
            initialInvigilators={invigilators}
            mode="manage"
            rooms={sessionRooms}
            sessionId={session.id}
            sessionName={session.name}
            sessionStatus={sessionStatus}
          />
        </details>
      )}

      <div className="card">
        <h2 className="section-title">Room Summary</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Room</th>
              <th>Allocated</th>
              <th>Present</th>
              <th>Mismatch Present</th>
              <th>Redirected</th>
            </tr>
          </thead>
          <tbody>
            {report.summaries.map((summary) => (
              <tr key={summary.roomId}>
                <td>{summary.roomCode}</td>
                <td>{summary.allocatedCount}</td>
                <td>
                  <div className="progress-cell">
                    <strong>{summary.presentCount}</strong>
                    <div className="progress-track" aria-label={`${summary.roomCode} attendance progress`}>
                      <div
                        className="progress-fill"
                        style={{
                          width: `${Math.min(
                            100,
                            summary.allocatedCount
                              ? Math.round((summary.presentCount / summary.allocatedCount) * 100)
                              : 0
                          )}%`
                        }}
                      />
                    </div>
                  </div>
                </td>
                <td>{summary.mismatchPresentCount}</td>
                <td>{summary.redirectedCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="inline-actions" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="kicker">Attendance Review</div>
            <h2 className="section-title">Marked Students</h2>
          </div>
          <form className="search-form" action={`/sessions/${session.id}`} method="get">
            <input
              name="q"
              placeholder="Search student number"
              defaultValue={notices.q || ""}
            />
            <button className="secondary" type="submit">
              Search
            </button>
            {notices.q ? (
              <Link className="button secondary" href={`/sessions/${session.id}`}>
                Clear
              </Link>
            ) : null}
          </form>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Student ID</th>
              <th>Student Name</th>
              <th>Marked In</th>
              <th>Expected Room</th>
              <th>Marked By</th>
              <th>Status</th>
              <th>Comment</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {attendanceRows.length ? (
              attendanceRows.map((row) => (
                <tr key={row.event.id}>
                  <td className="data-mono">{row.event.studentId}</td>
                  <td>{row.allocation?.studentName || "-"}</td>
                  <td>{row.markedInRoom?.code || row.event.markedInRoomId}</td>
                  <td>{row.expectedRoom?.code || row.event.expectedRoomId}</td>
                  <td>
                    {row.markedBy ? (
                      <>
                        <strong>{row.markedBy.fullName}</strong>
                        <br />
                        <span className="subtle">{row.markedBy.email}</span>
                      </>
                    ) : (
                      row.event.markedByUserId
                    )}
                  </td>
                  <td>
                    {row.event.roomMismatch ? (
                      <span className="pill warn">Mismatch present</span>
                    ) : (
                      <span className="pill ok">Present</span>
                    )}
                  </td>
                  <td>{row.event.comment || "-"}</td>
                  <td className="data-mono" title={row.event.createdAt}>
                    {formatAuditTime(row.event.createdAt)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="subtle">
                  {searchTerm
                    ? "No attendance entries match that student number."
                    : "No attendance has been marked for this exam yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
