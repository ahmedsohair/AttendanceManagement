import Link from "next/link";
import { getDashboardData } from "@/lib/admin-queries";
import { requireAdminPageUser } from "@/lib/auth";
import { logServerTiming } from "@/lib/timing";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const startedAt = performance.now();
  await requireAdminPageUser();
  const {
    activeSessions,
    draftSessions,
    closedSessions,
    overall,
    needsAttention,
    roomCountBySessionId
  } = await getDashboardData();
  logServerTiming("page.dashboard", startedAt, {
    activeSessions: activeSessions.length,
    draftSessions: draftSessions.length,
    closedSessions: closedSessions.length,
    present: overall.present,
    incidents: overall.incidents
  });

  return (
    <div className="stack">
      <div className="dashboard-hero">
        <div className="card">
          <div className="inline-actions" style={{ justifyContent: "space-between" }}>
            <div>
              <div className="kicker">Live Operations</div>
              <h2 className="section-title">Active Exams</h2>
            </div>
            <Link className="button secondary" href="/sessions">
              View all sessions
            </Link>
          </div>
          <div className="grid compact-grid">
            <Link className="card metric-card compact-card" href="/sessions">
              <div className="subtle">Active Exams</div>
              <div className="metric">{activeSessions.length}</div>
            </Link>
            <Link className="card metric-card compact-card" href="/attendance">
              <div className="subtle">Attendance Marked</div>
              <div className="metric">{overall.present}</div>
            </Link>
            <Link className="card metric-card compact-card" href="/mismatches">
              <div className="subtle">Mismatch Present</div>
              <div className="metric">{overall.mismatch}</div>
            </Link>
            <Link className="card metric-card compact-card" href="/incidents">
              <div className="subtle">Total Incidents</div>
              <div className="metric">{overall.incidents}</div>
            </Link>
          </div>
          <div className="exam-card-list">
            {activeSessions.length ? (
              activeSessions.map((session) => (
                <Link key={session.id} className="exam-row-card" href={`/sessions/${session.id}`}>
                  <span>
                    <strong>{session.name}</strong>
                    <span className="subtle">
                      {session.examDate} | {session.startTime}
                    </span>
                  </span>
                  <span className="pill">{roomCountBySessionId.get(session.id) || 0} room(s)</span>
                </Link>
              ))
            ) : (
              <div className="empty-action">
                <strong>No active exams yet</strong>
                <span>Create or publish an exam when operations are ready.</span>
                <Link className="button" href="/sessions/new">
                  Add New Exam
                </Link>
              </div>
            )}
          </div>
        </div>

        <div className="card attention-card">
          <div className="kicker">Needs Attention</div>
          <h2 className="section-title">Admin Actions</h2>
          <div className="attention-list">
            {needsAttention.map((item) => (
              <Link key={item.label} className={`attention-item ${item.tone}`} href={item.href}>
                <strong>{item.label}</strong>
                <span>{item.detail}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="layout-two">
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
              <div className="empty-action">
                <strong>No draft exams waiting</strong>
                <span>Import a roster to prepare the next exam.</span>
                <Link className="button secondary" href="/sessions/new">
                  Add New Exam
                </Link>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="kicker">History</div>
          <h2 className="section-title">Closed Exams</h2>
          <div className="exam-card-list">
            {closedSessions.length ? (
              closedSessions.slice(0, 5).map((session) => (
                <Link key={session.id} className="exam-row-card" href={`/sessions/${session.id}`}>
                  <span>
                    <strong>{session.name}</strong>
                    <span className="subtle">
                      {session.examDate} | {session.startTime}
                    </span>
                  </span>
                  <span className="pill">{roomCountBySessionId.get(session.id) || 0} room(s)</span>
                </Link>
              ))
            ) : (
              <div className="empty-action">
                <strong>No closed exams yet</strong>
                <span>Closed exams will appear here for reporting.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
