import Link from "next/link";
import { getExamSessionStatus } from "@algo-attendance/shared";
import { requireAdminPageUser } from "@/lib/auth";
import { formatAuditTime } from "@/lib/audit-time";
import { readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function MismatchesPage({
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

  const mismatches = store.attendanceEvents
    .filter((event) => event.roomMismatch && selectedSessionIds.has(event.examSessionId))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return (
    <div className="card">
      <div className="inline-actions" style={{ justifyContent: "space-between" }}>
        <div>
          <div className="kicker">Override Review</div>
          <h2 className="section-title">Mismatch Present</h2>
          <div className="subtle">
            Showing: <strong>{selectedSessionLabel}</strong>
          </div>
        </div>
        <form className="search-form table-filter-form" action="/mismatches" method="get">
          <select name="examSessionId" defaultValue={examSessionFilter}>
            <option value="active">Active exams only</option>
            <option value="all">All exams</option>
            {store.examSessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name} ({getExamSessionStatus(session)})
              </option>
            ))}
          </select>
          <button className="secondary" type="submit">
            Apply
          </button>
          <Link className="button secondary" href="/mismatches">
            Clear
          </Link>
        </form>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Student ID</th>
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
          {mismatches.length ? (
            mismatches.map((event) => (
              <tr key={event.id}>
                <td className="data-mono">{event.studentId}</td>
                <td>{sessionMap.get(event.examSessionId)?.name || event.examSessionId}</td>
                <td>{roomMap.get(event.markedInRoomId)?.code || event.markedInRoomId}</td>
                <td>{roomMap.get(event.expectedRoomId)?.code || event.expectedRoomId}</td>
                <td>
                  {userMap.get(event.markedByUserId) ? (
                    <>
                      <strong>{userMap.get(event.markedByUserId)?.fullName}</strong>
                      <br />
                      <span className="subtle">
                        {userMap.get(event.markedByUserId)?.email}
                      </span>
                    </>
                  ) : (
                    event.markedByUserId
                  )}
                </td>
                <td>
                  <span className="pill warn">{event.overrideType}</span>
                </td>
                <td>{event.comment || "-"}</td>
                <td className="data-mono" title={event.createdAt}>
                  {formatAuditTime(event.createdAt)}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={8} className="subtle">
                No mismatch-present overrides have been recorded.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
