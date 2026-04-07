import Link from "next/link";
import { buildExamSessionReport } from "@algo-attendance/shared";
import { requireAdminPageUser } from "@/lib/auth";
import { readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function SessionDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPageUser();
  const { id } = await params;
  const store = await readStore();
  const session = store.examSessions.find((item) => item.id === id);

  if (!session) {
    return <div className="card">Exam session not found.</div>;
  }

  const report = buildExamSessionReport(store, id);

  return (
    <div className="stack">
      <div className="card">
        <div className="inline-actions" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="pill">{session.published ? "Published" : "Draft"}</div>
            <h2 className="section-title" style={{ marginTop: 14 }}>
              {session.name}
            </h2>
            <div className="subtle">
              {session.examDate} | {session.startTime}
            </div>
          </div>
          <a className="button secondary" href={`/api/reports/${session.id}/export`}>
            Export XLSX
          </a>
        </div>
      </div>

      <div className="grid">
        <Link className="card metric-card" href="/attendance">
          <div className="subtle">Attendance Marked</div>
          <div className="metric">{report.attendance.length}</div>
        </Link>
        <Link className="card metric-card" href="/mismatches">
          <div className="subtle">Mismatch Present</div>
          <div className="metric">
            {report.attendance.filter((item) => item.roomMismatch).length}
          </div>
        </Link>
        <Link className="card metric-card" href="/incidents">
          <div className="subtle">Incidents</div>
          <div className="metric">{report.incidents.length}</div>
        </Link>
      </div>

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
                <td>{summary.presentCount}</td>
                <td>{summary.mismatchPresentCount}</td>
                <td>{summary.redirectedCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
