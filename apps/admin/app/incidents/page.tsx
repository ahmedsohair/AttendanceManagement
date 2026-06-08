import Link from "next/link";
import { getExamSessionStatus } from "@algo-attendance/shared";
import { requireAdminPageUser } from "@/lib/auth";
import { readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

function formatAuditTime(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

export default async function IncidentsPage({
  searchParams
}: {
  searchParams?: Promise<{
    examSessionId?: string;
  }>;
}) {
  await requireAdminPageUser();
  const params = (await searchParams) || {};
  const examSessionFilter = (params.examSessionId || "active").trim();
  const store = await readStore();
  const roomMap = new Map(store.rooms.map((room) => [room.id, room]));
  const sessionMap = new Map(store.examSessions.map((session) => [session.id, session]));
  const userMap = new Map(store.users.map((user) => [user.id, user]));
  const activeSessionIds = new Set(
    store.examSessions
      .filter((session) => getExamSessionStatus(session) === "active")
      .map((session) => session.id)
  );
  const selectedSessionIds =
    examSessionFilter === "all"
      ? new Set(store.examSessions.map((session) => session.id))
      : examSessionFilter === "active"
        ? activeSessionIds
        : new Set([examSessionFilter]);
  const selectedSessionLabel =
    examSessionFilter === "all"
      ? "All exams"
      : examSessionFilter === "active"
        ? "Active exams"
        : sessionMap.get(examSessionFilter)?.name || "Selected exam";

  const incidents = [...store.incidents]
    .filter((incident) => selectedSessionIds.has(incident.examSessionId))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const incidentGroups = incidents.reduce<Record<string, number>>((acc, incident) => {
    acc[incident.incidentType] = (acc[incident.incidentType] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="stack">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">Dashboard</Link>
        <span>/</span>
        <span>Incidents</span>
      </nav>

      <div className="grid compact-grid">
        {Object.entries(incidentGroups).length ? (
          Object.entries(incidentGroups).map(([type, count]) => (
            <div key={type} className="card compact-card">
              <div className="subtle">{type.replaceAll("_", " ")}</div>
              <div className="metric">{count}</div>
            </div>
          ))
        ) : (
          <div className="card compact-card">
            <div className="subtle">Incident groups</div>
            <div className="metric">0</div>
          </div>
        )}
      </div>

      <div className="card wide-card">
        <div className="inline-actions" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="kicker">Incident Log</div>
            <h2 className="section-title">Total Incidents</h2>
            <div className="subtle">
              Showing: <strong>{selectedSessionLabel}</strong>
            </div>
          </div>
          <form className="search-form table-filter-form" action="/incidents" method="get">
            <select name="examSessionId" defaultValue={examSessionFilter}>
              <option value="active">Active exams only</option>
              <option value="all">All exams</option>
              {store.examSessions.map((session) => {
                const status = getExamSessionStatus(session);

                return (
                  <option key={session.id} value={session.id}>
                    {session.name} ({status})
                  </option>
                );
              })}
            </select>
            <button className="secondary" type="submit">
              Apply
            </button>
            <Link className="button secondary" href="/incidents">
              Clear
            </Link>
          </form>
        </div>
        <div className="table-scroll">
      <table className="table compact-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Student ID</th>
            <th>Exam</th>
            <th>Room</th>
            <th>Expected Room</th>
            <th>Raised By</th>
            <th>Comment</th>
            <th>Timestamp</th>
          </tr>
        </thead>
        <tbody>
          {incidents.length ? (
            incidents.map((incident) => (
              <tr key={incident.id}>
                <td><span className="pill danger">{incident.incidentType}</span></td>
                <td className="data-mono">{incident.studentId || "-"}</td>
                <td>{sessionMap.get(incident.examSessionId)?.name || incident.examSessionId}</td>
                <td>
                  {incident.roomId ? roomMap.get(incident.roomId)?.code || incident.roomId : "-"}
                </td>
                <td>
                  {incident.expectedRoomId
                    ? roomMap.get(incident.expectedRoomId)?.code || incident.expectedRoomId
                    : "-"}
                </td>
                <td>
                  {incident.userId && userMap.get(incident.userId) ? (
                    <>
                      <strong>{userMap.get(incident.userId)?.fullName}</strong>
                      <br />
                      <span className="subtle">{userMap.get(incident.userId)?.email}</span>
                    </>
                  ) : (
                    incident.userId || "-"
                  )}
                </td>
                <td>
                  {typeof incident.details.comment === "string" && incident.details.comment
                    ? incident.details.comment
                    : "-"}
                </td>
                <td className="data-mono" title={incident.createdAt}>
                  {formatAuditTime(incident.createdAt)}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={8} className="subtle">
                No incidents recorded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
        </div>
      </div>
    </div>
  );
}
