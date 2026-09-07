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
    activeSessionCount,
    draftSessionCount,
    overall,
    needsAttention,
    roomCountBySessionId
  } = await getDashboardData();
  logServerTiming("page.dashboard", startedAt, {
    activeSessions: activeSessionCount,
    draftSessions: draftSessionCount,
    closedSessions: closedSessions.length,
    present: overall.present,
    incidents: overall.incidents
  });

  return (
    <div className="stack admin-dashboard">
      <div className="dashboard-hero">
        <section className="dashboard-primary-panel" aria-labelledby="active-exams-title">
          <div className="dashboard-section-heading">
            <div>
              <div className="kicker">Live Operations</div>
              <h1 className="section-title" id="active-exams-title">Active Exams</h1>
            </div>
            <Link className="button secondary" href="/sessions">
              View all sessions
            </Link>
          </div>
          <div className="dashboard-metrics" aria-label="Attendance overview">
            <Link className="dashboard-metric" href="/sessions">
              <div className="dashboard-metric-label">Active Exams</div>
              <div className="metric">{activeSessionCount}</div>
            </Link>
            <Link className="dashboard-metric" href="/attendance">
              <div className="dashboard-metric-label">Attendance Marked</div>
              <div className="metric">{overall.present}</div>
            </Link>
            <Link className="dashboard-metric" href="/mismatches">
              <div className="dashboard-metric-label">Mismatch Present</div>
              <div className="metric">{overall.mismatch}</div>
            </Link>
            <Link className="dashboard-metric" href="/incidents">
              <div className="dashboard-metric-label">Total Incidents</div>
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
          {activeSessionCount > activeSessions.length ? (
            <div className="subtle">
              Showing {activeSessions.length} of {activeSessionCount} active exams. View all sessions
              for the complete list.
            </div>
          ) : null}
        </section>

        <aside className="dashboard-attention attention-card" aria-labelledby="admin-actions-title">
          <div className="kicker">Needs Attention</div>
          <h2 className="section-title" id="admin-actions-title">Admin Actions</h2>
          <div className="attention-list">
            {needsAttention.map((item) => (
              <Link key={item.label} className={`attention-item ${item.tone}`} href={item.href}>
                <strong>{item.label}</strong>
                <span>{item.detail}</span>
              </Link>
            ))}
          </div>
        </aside>
      </div>

      <div className="layout-two dashboard-secondary">
        <section className="dashboard-list-panel dashboard-drafts" aria-labelledby="draft-exams-title">
          <div className="dashboard-section-heading">
            <div>
              <div className="kicker">Ready To Publish</div>
              <h2 className="section-title" id="draft-exams-title">Draft Exams</h2>
            </div>
          </div>
          <div className="dashboard-list">
            {draftSessions.length ? (
              draftSessions.map((session) => (
                <div key={session.id} className="dashboard-list-row">
                  <div className="dashboard-list-copy">
                    <Link className="inline-link" href={`/sessions/${session.id}`}>
                      {session.name}
                    </Link>
                    <div className="subtle">
                      {session.examDate} | {session.startTime}
                    </div>
                  </div>
                  <div className="dashboard-row-actions">
                    <Link className="button secondary" href={`/sessions/${session.id}`}>
                      Manage
                    </Link>
                    <form action={`/api/exam-sessions/${session.id}/publish`} method="post">
                      <button type="submit">Publish</button>
                    </form>
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
          {draftSessionCount > draftSessions.length ? (
            <div className="subtle">
              Showing {draftSessions.length} of {draftSessionCount} draft exams.
            </div>
          ) : null}
        </section>

        <section className="dashboard-list-panel" aria-labelledby="closed-exams-title">
          <div className="kicker">History</div>
          <h2 className="section-title" id="closed-exams-title">Closed Exams</h2>
          <div className="exam-card-list">
            {closedSessions.length ? (
              closedSessions.map((session) => (
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
        </section>
      </div>
    </div>
  );
}
