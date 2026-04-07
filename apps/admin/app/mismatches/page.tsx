import { requireAdminPageUser } from "@/lib/auth";
import { readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function MismatchesPage() {
  await requireAdminPageUser();
  const store = await readStore();
  const roomMap = new Map(store.rooms.map((room) => [room.id, room]));
  const sessionMap = new Map(store.examSessions.map((session) => [session.id, session]));

  const mismatches = store.attendanceEvents
    .filter((event) => event.roomMismatch)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return (
    <div className="card">
      <div className="kicker">Override Review</div>
      <h2 className="section-title">Mismatch Present</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Student ID</th>
            <th>Exam</th>
            <th>Marked In</th>
            <th>Expected Room</th>
            <th>Override</th>
            <th>Comment</th>
            <th>Timestamp</th>
          </tr>
        </thead>
        <tbody>
          {mismatches.length ? (
            mismatches.map((event) => (
              <tr key={event.id}>
                <td>{event.studentId}</td>
                <td>{sessionMap.get(event.examSessionId)?.name || event.examSessionId}</td>
                <td>{roomMap.get(event.markedInRoomId)?.code || event.markedInRoomId}</td>
                <td>{roomMap.get(event.expectedRoomId)?.code || event.expectedRoomId}</td>
                <td>
                  <span className="pill warn">{event.overrideType}</span>
                </td>
                <td>{event.comment || "-"}</td>
                <td>{event.createdAt}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7} className="subtle">
                No mismatch-present overrides have been recorded.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
