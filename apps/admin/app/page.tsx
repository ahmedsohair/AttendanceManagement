import Link from "next/link";
import {
  buildExamSessionReport,
  isActiveExamSession,
  isClosedExamSession,
  isDraftExamSession
} from "@algo-attendance/shared";
import { requireAdminPageUser } from "@/lib/auth";
import { readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireAdminPageUser();
  const store = await readStore();
  const activeSessions = store.examSessions.filter(isActiveExamSession);
  const draftSessions = store.examSessions.filter(isDraftExamSession);
  const closedSessions = store.examSessions.filter(isClosedExamSession);

  const overall = activeSessions.reduce(
    (acc, session) => {
      const report = buildExamSessionReport(store, session.id);
      acc.present += report.attendance.length;
      acc.mismatch += report.attendance.filter((item) => item.roomMismatch).length;
      acc.incidents += report.incidents.length;
      return acc;
    },
    { present: 0, mismatch: 0, incidents: 0 }
  );

  return (
    <div className="stack">
      <div className="grid">
        <Link className="card metric-card" href="/sessions">
          <div className="subtle">Active Exams</div>
          <div className="metric">{activeSessions.length}</div>
          <div className="metric-hint">Open active exam details</div>
        </Link>
        <Link className="card metric-card" href="/attendance">
          <div className="subtle">Attendance Marked</div>
          <div className="metric">{overall.present}</div>
          <div className="metric-hint">Review marked student entries</div>
        </Link>
        <Link className="card metric-card" href="/mismatches">
          <div className="subtle">Mismatch Present</div>
          <div className="metric">{overall.mismatch}</div>
          <div className="metric-hint">See wrong-room overrides</div>
        </Link>
        <Link className="card metric-card" href="/incidents">
          <div className="subtle">Total Incidents</div>
          <div className="metric">{overall.incidents}</div>
          <div className="metric-hint">Open incident audit trail</div>
        </Link>
      </div>

      <div className="layout-two">
        <div className="card">
          <div className="inline-actions" style={{ justifyContent: "space-between" }}>
            <div>
              <div className="kicker">Live Overview</div>
              <h2 className="section-title">Active Exams</h2>
            </div>
            <Link className="button secondary" href="/sessions">
              View all sessions
            </Link>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Date</th>
                <th>Rooms</th>
                <th>Export</th>
              </tr>
            </thead>
            <tbody>
              {activeSessions.length ? (
                activeSessions.map((session) => {
                  const roomCount = store.rooms.filter(
                    (room) => room.examSessionId === session.id
                  ).length;
                  return (
                    <tr key={session.id}>
                      <td>
                        <Link href={`/sessions/${session.id}`}>{session.name}</Link>
                      </td>
                      <td>
                        {session.examDate} | {session.startTime}
                      </td>
                      <td>{roomCount}</td>
                      <td>
                        <a
                          className="pill"
                          href={`/api/reports/${session.id}/export`}
                        >
                          Download XLSX
                        </a>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="subtle">
                    No active exams yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card tint">
          <div className="inline-actions" style={{ justifyContent: "space-between" }}>
            <div>
              <div className="kicker">Ready To Publish</div>
              <h2 className="section-title">Draft Exams</h2>
            </div>
          </div>
          <div className="stack">
            {draftSessions.length ? (
              draftSessions.map((session) => (
                <div key={session.id} className="card" style={{ padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <Link className="inline-link" href={`/sessions/${session.id}`}>
                        {session.name}
                      </Link>
                      <div className="subtle">
                        {session.examDate} | {session.startTime}
                      </div>
                    </div>
                    <div className="inline-actions">
                      <Link className="button secondary" href={`/sessions/${session.id}`}>
                        Manage
                      </Link>
                      <form action={`/api/exam-sessions/${session.id}/publish`} method="post">
                        <button type="submit">Publish</button>
                      </form>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="subtle">No draft exams waiting for publish.</div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="inline-actions" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="kicker">History</div>
            <h2 className="section-title">Closed Exams</h2>
          </div>
          <Link className="button secondary" href="/sessions">
            View all exams
          </Link>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Date</th>
              <th>Rooms</th>
              <th>Report</th>
            </tr>
          </thead>
          <tbody>
            {closedSessions.length ? (
              closedSessions.slice(0, 5).map((session) => {
                const roomCount = store.rooms.filter(
                  (room) => room.examSessionId === session.id
                ).length;
                return (
                  <tr key={session.id}>
                    <td>
                      <Link href={`/sessions/${session.id}`}>{session.name}</Link>
                    </td>
                    <td>
                      {session.examDate} | {session.startTime}
                    </td>
                    <td>{roomCount}</td>
                    <td>
                      <a className="pill" href={`/api/reports/${session.id}/export`}>
                        Download XLSX
                      </a>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={4} className="subtle">
                  No closed exams yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
