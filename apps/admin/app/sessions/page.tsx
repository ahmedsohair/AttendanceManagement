import Link from "next/link";
import {
  isActiveExamSession,
  isClosedExamSession,
  isDraftExamSession
} from "@algo-attendance/shared";
import { requireAdminPageUser } from "@/lib/auth";
import { readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  await requireAdminPageUser();
  const store = await readStore();
  const activeSessions = store.examSessions.filter(isActiveExamSession);
  const draftSessions = store.examSessions.filter(isDraftExamSession);
  const closedSessions = store.examSessions.filter(isClosedExamSession);

  return (
    <div className="stack">
      <div className="card">
        <div className="inline-actions" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="kicker">Active</div>
            <h2 className="section-title">Live Exam Sessions</h2>
          </div>
          <Link className="button" href="/sessions/new">
            Add New Exam
          </Link>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Date</th>
              <th>Time</th>
              <th>Rooms</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {activeSessions.length ? (
              activeSessions.map((session) => (
                <tr key={session.id}>
                  <td>
                    <Link href={`/sessions/${session.id}`}>{session.name}</Link>
                  </td>
                  <td>{session.examDate}</td>
                  <td>{session.startTime}</td>
                  <td>
                    {store.rooms.filter((room) => room.examSessionId === session.id).length}
                  </td>
                  <td>
                    <form action={`/api/exam-sessions/${session.id}/close`} method="post">
                      <button className="secondary" type="submit">Close</button>
                    </form>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="subtle">
                  No active exams yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="layout-two">
        <div className="card tint">
          <div className="kicker">Drafts</div>
          <h2 className="section-title">Waiting To Publish</h2>
          <div className="stack">
            {draftSessions.length ? (
              draftSessions.map((session) => (
                <div key={session.id} className="card" style={{ padding: 16 }}>
                  <div className="detail-row-main">
                    <div>
                      <Link className="inline-link" href={`/sessions/${session.id}`}>
                        {session.name}
                      </Link>
                      <div className="subtle">
                        {session.examDate} | {session.startTime}
                      </div>
                    </div>
                    <div className="inline-actions">
                      <form action={`/api/exam-sessions/${session.id}/publish`} method="post">
                        <button type="submit">Publish</button>
                      </form>
                      <form action={`/api/exam-sessions/${session.id}/delete`} method="post">
                        <button className="danger" type="submit">Delete</button>
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

        <div className="card">
          <div className="kicker">Closed</div>
          <h2 className="section-title">Exam History</h2>
          <div className="stack">
            {closedSessions.length ? (
              closedSessions.map((session) => (
                <div key={session.id} className="card" style={{ padding: 16 }}>
                  <div className="detail-row-main">
                    <div>
                      <Link className="inline-link" href={`/sessions/${session.id}`}>
                        {session.name}
                      </Link>
                      <div className="subtle">
                        {session.examDate} | {session.startTime}
                      </div>
                    </div>
                    <div className="inline-actions">
                      <a className="pill" href={`/api/reports/${session.id}/export`}>
                        Export
                      </a>
                      <form action={`/api/exam-sessions/${session.id}/delete`} method="post">
                        <button className="danger" type="submit">Delete</button>
                      </form>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="subtle">No closed exams yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
