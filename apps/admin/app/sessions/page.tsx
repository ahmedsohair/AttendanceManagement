import Link from "next/link";
import { requireAdminPageUser } from "@/lib/auth";
import { readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  await requireAdminPageUser();
  const store = await readStore();
  const publishedSessions = store.examSessions.filter((session) => session.published);
  const draftSessions = store.examSessions.filter((session) => !session.published);

  return (
    <div className="layout-two">
      <div className="card">
        <div className="inline-actions" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="kicker">Published</div>
            <h2 className="section-title">Exam Sessions</h2>
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
            </tr>
          </thead>
          <tbody>
            {publishedSessions.length ? (
              publishedSessions.map((session) => (
                <tr key={session.id}>
                  <td>
                    <Link href={`/sessions/${session.id}`}>{session.name}</Link>
                  </td>
                  <td>{session.examDate}</td>
                  <td>{session.startTime}</td>
                  <td>
                    {store.rooms.filter((room) => room.examSessionId === session.id).length}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="subtle">
                  No published exams yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card tint">
        <div className="kicker">Drafts</div>
        <h2 className="section-title">Waiting To Publish</h2>
        <div className="stack">
          {draftSessions.length ? (
            draftSessions.map((session) => (
              <div key={session.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{session.name}</div>
                    <div className="subtle">
                      {session.examDate} | {session.startTime}
                    </div>
                  </div>
                  <form action={`/api/exam-sessions/${session.id}/publish`} method="post">
                    <button type="submit">Publish</button>
                  </form>
                </div>
              </div>
            ))
          ) : (
            <div className="subtle">No draft exams waiting for publish.</div>
          )}
        </div>
      </div>
    </div>
  );
}
