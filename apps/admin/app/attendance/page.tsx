import Link from "next/link";
import { requireAdminPageUser } from "@/lib/auth";
import { readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function AttendancePage({
  searchParams
}: {
  searchParams?: Promise<{
    q?: string;
    room?: string;
    status?: string;
    sort?: string;
  }>;
}) {
  await requireAdminPageUser();
  const params = (await searchParams) || {};
  const query = (params.q || "").trim().toLowerCase();
  const roomFilter = (params.room || "").trim();
  const statusFilter = (params.status || "").trim();
  const sort = params.sort === "oldest" ? "oldest" : "newest";
  const store = await readStore();
  const roomMap = new Map(store.rooms.map((room) => [room.id, room]));
  const sessionMap = new Map(store.examSessions.map((session) => [session.id, session]));
  const userMap = new Map(store.users.map((user) => [user.id, user]));
  const allocationMap = new Map(
    store.studentAllocations.map((allocation) => [
      `${allocation.examSessionId}:${allocation.studentId}`,
      allocation
    ])
  );

  const attendance = [...store.attendanceEvents]
    .filter((event) => {
      const allocation = allocationMap.get(`${event.examSessionId}:${event.studentId}`);
      if (query) {
        const markedBy = userMap.get(event.markedByUserId);
        const searchable = [
          event.studentId,
          allocation?.studentName || "",
          sessionMap.get(event.examSessionId)?.name || "",
          markedBy?.fullName || "",
          markedBy?.email || "",
          event.comment || ""
        ]
          .join(" ")
          .toLowerCase();

        if (!searchable.includes(query)) {
          return false;
        }
      }

      if (roomFilter && event.markedInRoomId !== roomFilter) {
        return false;
      }

      if (statusFilter === "mismatch" && !event.roomMismatch) {
        return false;
      }

      if (statusFilter === "commented" && !event.comment) {
        return false;
      }

      if (statusFilter === "standard" && event.roomMismatch) {
        return false;
      }

      return true;
    })
    .sort((left, right) =>
      sort === "oldest"
        ? left.createdAt.localeCompare(right.createdAt)
        : right.createdAt.localeCompare(left.createdAt)
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
        </div>
        <form className="search-form table-filter-form" action="/attendance" method="get">
          <input name="q" placeholder="Search student/name/comment" defaultValue={params.q || ""} />
          <select name="room" defaultValue={roomFilter}>
            <option value="">All rooms</option>
            {store.rooms.map((room) => (
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
          {attendance.length ? (
            attendance.map((event) => {
              const allocation = allocationMap.get(`${event.examSessionId}:${event.studentId}`);

              return (
              <tr key={event.id} className="clickable-row">
                <td className="data-mono">
                  <Link className="inline-link" href={`/sessions/${event.examSessionId}?q=${event.studentId}`}>
                    {event.studentId}
                  </Link>
                </td>
                <td>{allocation?.studentName || "-"}</td>
                <td>
                  <Link href={`/sessions/${event.examSessionId}`}>
                    {sessionMap.get(event.examSessionId)?.name || event.examSessionId}
                  </Link>
                </td>
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
                  {event.roomMismatch ? (
                    <span className="pill warn">{event.source} | mismatch</span>
                  ) : (
                    <span className="pill ok">{event.source}</span>
                  )}
                </td>
                <td>{event.comment || "-"}</td>
                <td className="data-mono">{event.createdAt}</td>
              </tr>
              );
            })
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
    </div>
  );
}
