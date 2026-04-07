import { requireAdminPageUser } from "@/lib/auth";
import { readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function IncidentsPage() {
  await requireAdminPageUser();
  const store = await readStore();
  const roomMap = new Map(store.rooms.map((room) => [room.id, room]));
  const sessionMap = new Map(store.examSessions.map((session) => [session.id, session]));
  const userMap = new Map(store.users.map((user) => [user.id, user]));

  const incidents = [...store.incidents].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt)
  );

  return (
    <div className="card">
      <div className="kicker">Incident Log</div>
      <h2 className="section-title">Total Incidents</h2>
      <table className="table">
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
                <td>{incident.incidentType}</td>
                <td>{incident.studentId || "-"}</td>
                <td>{sessionMap.get(incident.examSessionId)?.name || incident.examSessionId}</td>
                <td>
                  {incident.roomId ? roomMap.get(incident.roomId)?.code || incident.roomId : "-"}
                </td>
                <td>
                  {incident.expectedRoomId
                    ? roomMap.get(incident.expectedRoomId)?.code || incident.expectedRoomId
                    : "-"}
                </td>
                <td>{incident.userId ? userMap.get(incident.userId)?.fullName || incident.userId : "-"}</td>
                <td>
                  {typeof incident.details.comment === "string" && incident.details.comment
                    ? incident.details.comment
                    : "-"}
                </td>
                <td>{incident.createdAt}</td>
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
  );
}
