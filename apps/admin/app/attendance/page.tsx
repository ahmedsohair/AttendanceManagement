import Link from "next/link";
import { getExamSessionStatus } from "@algo-attendance/shared";
import {
  getAttendanceAuditPage,
  type AttendanceAuditSort,
  type AttendanceAuditStatus
} from "@/lib/admin-queries";
import { formatAuditTime } from "@/lib/audit-time";
import { requireAdminPageUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type AttendanceSearchParams = {
  q?: string;
  room?: string;
  examSessionId?: string;
  status?: string;
  sort?: string;
  page?: string;
};

function normalizeStatus(value?: string): AttendanceAuditStatus {
  return value === "standard" || value === "mismatch" || value === "commented"
    ? value
    : "";
}

function normalizeSort(value?: string): AttendanceAuditSort {
  return value === "oldest" ? "oldest" : "newest";
}

function normalizePage(value?: string) {
  const page = Number.parseInt(value || "1", 10);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function pageHref(params: AttendanceSearchParams, page: number) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key !== "page" && value) query.set(key, value);
  }
  if (page > 1) query.set("page", String(page));
  const serialized = query.toString();
  return serialized ? `/attendance?${serialized}` : "/attendance";
}

export default async function AttendancePage({
  searchParams
}: {
  searchParams?: Promise<AttendanceSearchParams>;
}) {
  await requireAdminPageUser();
  const params = (await searchParams) || {};
  const query = (params.q || "").trim();
  const roomFilter = (params.room || "").trim();
  const examSessionFilter = (params.examSessionId || "active").trim();
  const statusFilter = normalizeStatus(params.status);
  const sort = normalizeSort(params.sort);
  const auditPage = await getAttendanceAuditPage({
    examSessionFilter,
    query,
    roomId: roomFilter,
    status: statusFilter,
    sort,
    page: normalizePage(params.page)
  });
  const sessionMap = new Map(
    auditPage.sessions.map((session) => [session.id, session])
  );
  const selectedSessionLabel =
    examSessionFilter === "all"
      ? "All exams"
      : examSessionFilter === "active"
        ? "Active exams"
        : sessionMap.get(examSessionFilter)?.name || "Active exams";
  const firstRow = auditPage.totalCount
    ? (auditPage.page - 1) * auditPage.pageSize + 1
    : 0;
  const lastRow = Math.min(
    auditPage.page * auditPage.pageSize,
    auditPage.totalCount
  );

  return (
    <div className="card wide-card">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">Dashboard</Link>
        <span>/</span>
        <span>Attendance</span>
      </nav>
      <div className="inline-actions" style={{ justifyContent: "space-between" }}>
        <div>
          <div className="kicker">Attendance Audit</div>
          <h2 className="section-title">Attendance Marked</h2>
          <div className="subtle">
            Showing: <strong>{selectedSessionLabel}</strong>
          </div>
        </div>
        <form className="search-form table-filter-form" action="/attendance" method="get">
          <select name="examSessionId" defaultValue={examSessionFilter}>
            <option value="active">Active exams only</option>
            <option value="all">All exams</option>
            {auditPage.sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name} ({getExamSessionStatus(session)})
              </option>
            ))}
          </select>
          <input name="q" placeholder="Search student/name/comment" defaultValue={query} />
          <select name="room" defaultValue={roomFilter}>
            <option value="">All rooms</option>
            {auditPage.rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.code}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={statusFilter}>
            <option value="">All statuses</option>
            <option value="standard">Standard present</option>
            <option value="mismatch">Mismatch present</option>
            <option value="commented">Has comment</option>
          </select>
          <select name="sort" defaultValue={sort}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
          <button className="secondary" type="submit">Apply</button>
          <Link className="button secondary" href="/attendance">Clear</Link>
        </form>
      </div>
      <div className="table-scroll">
        <table className="table compact-table">
          <thead>
            <tr>
              <th>Student ID</th>
              <th>Student Name</th>
              <th>Exam</th>
              <th>Marked In</th>
              <th>Expected Room</th>
              <th>Marked By</th>
              <th>Source</th>
              <th>Comment</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {auditPage.rows.length ? (
              auditPage.rows.map((event) => (
                <tr key={event.id} className="clickable-row">
                  <td className="data-mono">
                    <Link
                      className="inline-link"
                      href={`/sessions/${event.examSessionId}?q=${encodeURIComponent(event.studentId)}`}
                    >
                      {event.studentId}
                    </Link>
                  </td>
                  <td>{event.studentName || "-"}</td>
                  <td>
                    <Link href={`/sessions/${event.examSessionId}`}>{event.examName}</Link>
                  </td>
                  <td>{event.markedInRoomCode}</td>
                  <td>{event.expectedRoomCode}</td>
                  <td>
                    <strong>{event.markedByName}</strong>
                    {event.markedByEmail ? (
                      <>
                        <br />
                        <span className="subtle">{event.markedByEmail}</span>
                      </>
                    ) : null}
                  </td>
                  <td>
                    {event.roomMismatch ? (
                      <span className="pill warn">{event.source} | mismatch</span>
                    ) : (
                      <span className="pill ok">{event.source}</span>
                    )}
                  </td>
                  <td>{event.comment || "-"}</td>
                  <td className="data-mono" title={event.createdAt}>
                    {formatAuditTime(event.createdAt)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="subtle">
                  No attendance entries match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <nav className="pagination-bar" aria-label="Attendance pages">
        <span className="pagination-summary">
          {auditPage.totalCount
            ? `${firstRow}-${lastRow} of ${auditPage.totalCount}`
            : "0 records"}
        </span>
        <div className="inline-actions">
          {auditPage.page > 1 ? (
            <Link className="button secondary" href={pageHref(params, auditPage.page - 1)}>
              Previous
            </Link>
          ) : (
            <span className="button secondary disabled" aria-disabled="true">Previous</span>
          )}
          <span className="pagination-summary">
            Page {auditPage.page} of {auditPage.totalPages}
          </span>
          {auditPage.page < auditPage.totalPages ? (
            <Link className="button secondary" href={pageHref(params, auditPage.page + 1)}>
              Next
            </Link>
          ) : (
            <span className="button secondary disabled" aria-disabled="true">Next</span>
          )}
        </div>
      </nav>
    </div>
  );
}
