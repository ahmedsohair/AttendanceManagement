import Link from "next/link";
import { getExamSessionStatus } from "@algo-attendance/shared";
import {
  getIncidentAuditPage,
  type IncidentAuditSort,
  type IncidentAuditType
} from "@/lib/admin-queries";
import { formatAuditTime } from "@/lib/audit-time";
import { requireAdminPageUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type IncidentSearchParams = {
  examSessionId?: string;
  q?: string;
  room?: string;
  type?: string;
  sort?: string;
  page?: string;
};

function normalizeIncidentType(value?: string): IncidentAuditType {
  return value === "wrong_room_redirected" ||
    value === "wrong_room_present_override" ||
    value === "duplicate_attempt" ||
    value === "student_not_found"
    ? value
    : "";
}

function normalizeSort(value?: string): IncidentAuditSort {
  return value === "oldest" ? "oldest" : "newest";
}

function normalizePage(value?: string) {
  const page = Number.parseInt(value || "1", 10);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function pageHref(params: IncidentSearchParams, page: number) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key !== "page" && value) query.set(key, value);
  }
  if (page > 1) query.set("page", String(page));
  const serialized = query.toString();
  return serialized ? `/incidents?${serialized}` : "/incidents";
}

export default async function IncidentsPage({
  searchParams
}: {
  searchParams?: Promise<IncidentSearchParams>;
}) {
  await requireAdminPageUser();
  const params = (await searchParams) || {};
  const examSessionFilter = (params.examSessionId || "active").trim();
  const query = (params.q || "").trim();
  const roomFilter = (params.room || "").trim();
  const incidentType = normalizeIncidentType(params.type);
  const sort = normalizeSort(params.sort);
  const incidentPage = await getIncidentAuditPage({
    examSessionFilter,
    query,
    roomId: roomFilter,
    incidentType,
    sort,
    page: normalizePage(params.page)
  });
  const sessionMap = new Map(
    incidentPage.sessions.map((session) => [session.id, session])
  );
  const selectedSessionLabel =
    examSessionFilter === "all"
      ? "All exams"
      : examSessionFilter === "active"
        ? "Active exams"
        : sessionMap.get(examSessionFilter)?.name || "Active exams";
  const firstRow = incidentPage.totalCount
    ? (incidentPage.page - 1) * incidentPage.pageSize + 1
    : 0;
  const lastRow = Math.min(
    incidentPage.page * incidentPage.pageSize,
    incidentPage.totalCount
  );

  return (
    <div className="stack">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">Dashboard</Link>
        <span>/</span>
        <span>Incidents</span>
      </nav>

      <div className="card compact-card">
        <div className="subtle">Matching incidents</div>
        <div className="metric">{incidentPage.totalCount}</div>
      </div>

      <div className="card wide-card">
        <div className="inline-actions" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="kicker">Incident Log</div>
            <h2 className="section-title">Recorded Incidents</h2>
            <div className="subtle">
              Showing: <strong>{selectedSessionLabel}</strong>
            </div>
          </div>
          <form className="search-form table-filter-form" action="/incidents" method="get">
            <select name="examSessionId" defaultValue={examSessionFilter}>
              <option value="active">Active exams only</option>
              <option value="all">All exams</option>
              {incidentPage.sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name} ({getExamSessionStatus(session)})
                </option>
              ))}
            </select>
            <input name="q" placeholder="Search student/comment/staff" defaultValue={query} />
            <select name="room" defaultValue={roomFilter}>
              <option value="">All rooms</option>
              {incidentPage.rooms.map((room) => (
                <option key={room.id} value={room.id}>{room.code}</option>
              ))}
            </select>
            <select name="type" defaultValue={incidentType}>
              <option value="">All incident types</option>
              <option value="wrong_room_redirected">Wrong room redirected</option>
              <option value="wrong_room_present_override">Wrong room marked present</option>
              <option value="duplicate_attempt">Duplicate attempt</option>
              <option value="student_not_found">Student not found</option>
            </select>
            <select name="sort" defaultValue={sort}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
            <button className="secondary" type="submit">Apply</button>
            <Link className="button secondary" href="/incidents">Clear</Link>
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
              {incidentPage.rows.length ? (
                incidentPage.rows.map((incident) => (
                  <tr key={incident.id}>
                    <td>
                      <span className="pill danger">
                        {incident.incidentType.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="data-mono">{incident.studentId || "-"}</td>
                    <td>
                      <Link href={`/sessions/${incident.examSessionId}`}>
                        {incident.examName}
                      </Link>
                    </td>
                    <td>{incident.roomCode || "-"}</td>
                    <td>{incident.expectedRoomCode || "-"}</td>
                    <td>
                      {incident.raisedByName ? (
                        <>
                          <strong>{incident.raisedByName}</strong>
                          {incident.raisedByEmail ? (
                            <>
                              <br />
                              <span className="subtle">{incident.raisedByEmail}</span>
                            </>
                          ) : null}
                        </>
                      ) : (
                        incident.userId || "-"
                      )}
                    </td>
                    <td>
                      {typeof incident.details.comment === "string" &&
                      incident.details.comment
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
                    No incidents match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <nav className="pagination-bar" aria-label="Incident pages">
          <span className="pagination-summary">
            {incidentPage.totalCount
              ? `${firstRow}-${lastRow} of ${incidentPage.totalCount}`
              : "0 records"}
          </span>
          <div className="inline-actions">
            {incidentPage.page > 1 ? (
              <Link className="button secondary" href={pageHref(params, incidentPage.page - 1)}>
                Previous
              </Link>
            ) : (
              <span className="button secondary disabled" aria-disabled="true">Previous</span>
            )}
            <span className="pagination-summary">
              Page {incidentPage.page} of {incidentPage.totalPages}
            </span>
            {incidentPage.page < incidentPage.totalPages ? (
              <Link className="button secondary" href={pageHref(params, incidentPage.page + 1)}>
                Next
              </Link>
            ) : (
              <span className="button secondary disabled" aria-disabled="true">Next</span>
            )}
          </div>
        </nav>
      </div>
    </div>
  );
}
