import Link from "next/link";
import { getExamSessionStatus } from "@algo-attendance/shared";
import {
  getAttendanceAuditPage,
  type AttendanceAuditSort
} from "@/lib/admin-queries";
import { formatAuditTime } from "@/lib/audit-time";
import { requireAdminPageUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type MismatchSearchParams = {
  examSessionId?: string;
  q?: string;
  room?: string;
  sort?: string;
  page?: string;
};

function normalizeSort(value?: string): AttendanceAuditSort {
  return value === "oldest" ? "oldest" : "newest";
}

function normalizePage(value?: string) {
  const page = Number.parseInt(value || "1", 10);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function pageHref(params: MismatchSearchParams, page: number) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key !== "page" && value) query.set(key, value);
  }
  if (page > 1) query.set("page", String(page));
  const serialized = query.toString();
  return serialized ? `/mismatches?${serialized}` : "/mismatches";
}

export default async function MismatchesPage({
  searchParams
}: {
  searchParams?: Promise<MismatchSearchParams>;
}) {
  await requireAdminPageUser();
  const params = (await searchParams) || {};
  const examSessionFilter = (params.examSessionId || "active").trim();
  const query = (params.q || "").trim();
  const roomFilter = (params.room || "").trim();
  const sort = normalizeSort(params.sort);
  const mismatchPage = await getAttendanceAuditPage({
    examSessionFilter,
    query,
    roomId: roomFilter,
    status: "mismatch",
    sort,
    page: normalizePage(params.page)
  });
  const sessionMap = new Map(
    mismatchPage.sessions.map((session) => [session.id, session])
  );
  const selectedSessionLabel =
    examSessionFilter === "all"
      ? "All exams"
      : examSessionFilter === "active"
        ? "Active exams"
        : sessionMap.get(examSessionFilter)?.name || "Active exams";
  const firstRow = mismatchPage.totalCount
    ? (mismatchPage.page - 1) * mismatchPage.pageSize + 1
    : 0;
  const lastRow = Math.min(
    mismatchPage.page * mismatchPage.pageSize,
    mismatchPage.totalCount
  );

  return (
    <div className="card wide-card">
      <div className="inline-actions" style={{ justifyContent: "space-between" }}>
        <div>
          <div className="kicker">Override Review</div>
          <h2 className="section-title">Mismatch Present</h2>
          <div className="subtle">
            Showing: <strong>{selectedSessionLabel}</strong> | {mismatchPage.totalCount} record(s)
          </div>
        </div>
        <form className="search-form table-filter-form" action="/mismatches" method="get">
          <select name="examSessionId" defaultValue={examSessionFilter}>
            <option value="active">Active exams only</option>
            <option value="all">All exams</option>
            {mismatchPage.sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name} ({getExamSessionStatus(session)})
              </option>
            ))}
          </select>
          <input name="q" placeholder="Search student/name/comment" defaultValue={query} />
          <select name="room" defaultValue={roomFilter}>
            <option value="">All marked rooms</option>
            {mismatchPage.rooms.map((room) => (
              <option key={room.id} value={room.id}>{room.code}</option>
            ))}
          </select>
          <select name="sort" defaultValue={sort}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
          <button className="secondary" type="submit">Apply</button>
          <Link className="button secondary" href="/mismatches">Clear</Link>
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
              <th>Override</th>
              <th>Comment</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {mismatchPage.rows.length ? (
              mismatchPage.rows.map((event) => (
                <tr key={event.id}>
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
                  <td><span className="pill warn">{event.overrideType}</span></td>
                  <td>{event.comment || "-"}</td>
                  <td className="data-mono" title={event.createdAt}>
                    {formatAuditTime(event.createdAt)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="subtle">
                  No mismatch-present overrides match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <nav className="pagination-bar" aria-label="Mismatch pages">
        <span className="pagination-summary">
          {mismatchPage.totalCount
            ? `${firstRow}-${lastRow} of ${mismatchPage.totalCount}`
            : "0 records"}
        </span>
        <div className="inline-actions">
          {mismatchPage.page > 1 ? (
            <Link className="button secondary" href={pageHref(params, mismatchPage.page - 1)}>
              Previous
            </Link>
          ) : (
            <span className="button secondary disabled" aria-disabled="true">Previous</span>
          )}
          <span className="pagination-summary">
            Page {mismatchPage.page} of {mismatchPage.totalPages}
          </span>
          {mismatchPage.page < mismatchPage.totalPages ? (
            <Link className="button secondary" href={pageHref(params, mismatchPage.page + 1)}>
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
