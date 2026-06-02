import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { buildExamSessionReport } from "@algo-attendance/shared";
import { requireAdminPageUser } from "@/lib/auth";
import { updateInvigilatorRoomAssignments } from "@/lib/repository";
import { readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

async function submitSessionAssignments(formData: FormData) {
  "use server";

  const sessionId = String(formData.get("sessionId") || "").trim();
  const invigilatorIds = formData
    .getAll("invigilatorIds")
    .map((value) => String(value))
    .filter(Boolean);
  const selectedRoomIdsByInvigilator = new Map<string, string[]>();

  for (const invigilatorId of invigilatorIds) {
    selectedRoomIdsByInvigilator.set(
      invigilatorId,
      formData
        .getAll(`roomIds:${invigilatorId}`)
        .map((value) => String(value))
        .filter(Boolean)
    );
  }

  try {
    await requireAdminPageUser();
    const store = await readStore();
    const sessionRooms = store.rooms.filter((room) => room.examSessionId === sessionId);
    const sessionRoomIds = new Set(sessionRooms.map((room) => room.id));

    for (const invigilator of store.users.filter((user) => user.role === "invigilator")) {
      const existingOtherExamRoomIds = invigilator.assignedRoomIds.filter(
        (roomId) => !sessionRoomIds.has(roomId)
      );
      const selectedSessionRoomIds =
        selectedRoomIdsByInvigilator.get(invigilator.id) || [];

      await updateInvigilatorRoomAssignments({
        userId: invigilator.id,
        assignedRoomIds: [...existingOtherExamRoomIds, ...selectedSessionRoomIds]
      });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update invigilator assignments.";
    redirect(`/sessions/${sessionId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/invigilators");
  redirect(`/sessions/${sessionId}?message=Invigilator%20assignments%20updated.`);
}

export default async function SessionDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ message?: string; error?: string; q?: string }>;
}) {
  await requireAdminPageUser();
  const { id } = await params;
  const notices = (await searchParams) || {};
  const searchTerm = (notices.q || "").trim().toLowerCase();
  const store = await readStore();
  const session = store.examSessions.find((item) => item.id === id);

  if (!session) {
    return <div className="card">Exam session not found.</div>;
  }

  const report = buildExamSessionReport(store, id);
  const sessionRooms = store.rooms
    .filter((room) => room.examSessionId === id)
    .sort((left, right) => left.code.localeCompare(right.code));
  const invigilators = store.users
    .filter((user) => user.role === "invigilator")
    .sort((left, right) => left.fullName.localeCompare(right.fullName));
  const roomMap = new Map(store.rooms.map((room) => [room.id, room]));
  const userMap = new Map(store.users.map((user) => [user.id, user]));
  const allocationByStudentId = new Map(
    store.studentAllocations
      .filter((allocation) => allocation.examSessionId === id)
      .map((allocation) => [allocation.studentId, allocation])
  );
  const attendanceRows = report.attendance
    .map((event) => ({
      event,
      allocation: allocationByStudentId.get(event.studentId),
      markedInRoom: roomMap.get(event.markedInRoomId),
      expectedRoom: roomMap.get(event.expectedRoomId),
      markedBy: userMap.get(event.markedByUserId)
    }))
    .filter((row) => {
      if (!searchTerm) {
        return true;
      }

      return (
        row.event.studentId.toLowerCase().includes(searchTerm) ||
        (row.allocation?.studentName || "").toLowerCase().includes(searchTerm)
      );
    })
    .sort((left, right) => right.event.createdAt.localeCompare(left.event.createdAt));

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

      <details className="card tint disclosure-card">
        <summary>
          <span>
            <span className="kicker">Room Access</span>
            <span className="section-title summary-title">
              Assign Invigilators To This Exam
            </span>
          </span>
          <span className="pill">
            {invigilators.filter((invigilator) =>
              invigilator.assignedRoomIds.some((roomId) =>
                sessionRooms.some((room) => room.id === roomId)
              )
            ).length} assigned
          </span>
        </summary>
        {notices.message ? <p className="pill ok">{notices.message}</p> : null}
        {notices.error ? <p className="pill warn">{notices.error}</p> : null}
        {invigilators.length ? (
          <form className="assignment-form" action={submitSessionAssignments}>
            <input name="sessionId" type="hidden" value={session.id} />
            <div className="detail-list">
              {invigilators.map((invigilator) => (
                <div key={invigilator.id} className="detail-row stacked">
                  <label className="detail-row-main">
                    <span>
                      <strong>{invigilator.fullName}</strong>
                      <br />
                      <span className="subtle">{invigilator.email}</span>
                    </span>
                    <input
                      name="invigilatorIds"
                      type="hidden"
                      value={invigilator.id}
                    />
                  </label>
                  <div className="checkbox-grid compact">
                    {sessionRooms.map((room) => (
                      <label key={room.id} className="checkbox-card">
                        <input
                          name={`roomIds:${invigilator.id}`}
                          type="checkbox"
                          value={room.id}
                          defaultChecked={invigilator.assignedRoomIds.includes(room.id)}
                        />
                        <span>
                          <strong>{room.code}</strong>
                          <br />
                          <span className="subtle">{room.displayName}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button type="submit">Save Exam Assignments</button>
          </form>
        ) : (
          <div className="subtle">
            Add invigilators first, then return here to assign them to rooms.
          </div>
        )}
      </details>

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

      <div className="card">
        <div className="inline-actions" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="kicker">Attendance Review</div>
            <h2 className="section-title">Marked Students</h2>
          </div>
          <form className="search-form" action={`/sessions/${session.id}`} method="get">
            <input
              name="q"
              placeholder="Search student number"
              defaultValue={notices.q || ""}
            />
            <button className="secondary" type="submit">
              Search
            </button>
            {notices.q ? (
              <Link className="button secondary" href={`/sessions/${session.id}`}>
                Clear
              </Link>
            ) : null}
          </form>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Student ID</th>
              <th>Student Name</th>
              <th>Marked In</th>
              <th>Expected Room</th>
              <th>Marked By</th>
              <th>Status</th>
              <th>Comment</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {attendanceRows.length ? (
              attendanceRows.map((row) => (
                <tr key={row.event.id}>
                  <td>{row.event.studentId}</td>
                  <td>{row.allocation?.studentName || "-"}</td>
                  <td>{row.markedInRoom?.code || row.event.markedInRoomId}</td>
                  <td>{row.expectedRoom?.code || row.event.expectedRoomId}</td>
                  <td>
                    {row.markedBy ? (
                      <>
                        <strong>{row.markedBy.fullName}</strong>
                        <br />
                        <span className="subtle">{row.markedBy.email}</span>
                      </>
                    ) : (
                      row.event.markedByUserId
                    )}
                  </td>
                  <td>
                    {row.event.roomMismatch ? (
                      <span className="pill warn">Mismatch present</span>
                    ) : (
                      <span className="pill ok">Present</span>
                    )}
                  </td>
                  <td>{row.event.comment || "-"}</td>
                  <td>{row.event.createdAt}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="subtle">
                  {searchTerm
                    ? "No attendance entries match that student number."
                    : "No attendance has been marked for this exam yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
