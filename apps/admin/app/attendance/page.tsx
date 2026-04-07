import { requireAdminPageUser } from "@/lib/auth";
import { readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  await requireAdminPageUser();
  const store = await readStore();
  const roomMap = new Map(store.rooms.map((room) => [room.id, room]));
  const sessionMap = new Map(store.examSessions.map((session) => [session.id, session]));

  const attendance = [...store.attendanceEvents].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt)
  );

  return (
    <div className="card">
      <div className="kicker">Attendance Audit</div>
      <h2 className="section-title">Attendance Marked</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Student ID</th>
            <th>Exam</th>
            <th>Marked In</th>
            <th>Expected Room</th>
            <th>Source</th>
            <th>Comment</th>
            <th>Timestamp</th>
          </tr>
        </thead>
        <tbody>
          {attendance.length ? (
            attendance.map((event) => (
              <tr key={event.id}>
                <td>{event.studentId}</td>
                <td>{sessionMap.get(event.examSessionId)?.name || event.examSessionId}</td>
                <td>{roomMap.get(event.markedInRoomId)?.code || event.markedInRoomId}</td>
                <td>{roomMap.get(event.expectedRoomId)?.code || event.expectedRoomId}</td>
                <td>
                  {event.roomMismatch ? (
                    <span className="pill warn">{event.source} | mismatch</span>
                  ) : (
                    <span className="pill ok">{event.source}</span>
                  )}
                </td>
                <td>{event.comment || "-"}</td>
                <td>{event.createdAt}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7} className="subtle">
                No attendance has been marked yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
