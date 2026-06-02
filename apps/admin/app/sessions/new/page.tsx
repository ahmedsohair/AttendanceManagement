import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminPageUser } from "@/lib/auth";
import {
  createInvigilator as createInvigilatorRecord,
  updateInvigilatorRoomAssignments
} from "@/lib/repository";
import { buildAccessCodeMailto } from "@/lib/access-code-email";
import { readStore } from "@/lib/store";
import { NewExamImportForm } from "@/components/new-exam-import-form";

export const dynamic = "force-dynamic";

async function submitNewExamAssignments(formData: FormData) {
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
    redirect(
      `/sessions/new?sessionId=${encodeURIComponent(sessionId)}&error=${encodeURIComponent(
        message
      )}`
    );
  }

  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/sessions/new");
  revalidatePath("/invigilators");
  redirect(
    `/sessions/new?sessionId=${encodeURIComponent(
      sessionId
    )}&message=Invigilator%20assignments%20updated.`
  );
}

async function submitNewExamInvigilator(formData: FormData) {
  "use server";

  const sessionId = String(formData.get("sessionId") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const submittedFullName = String(formData.get("fullName") || "").trim();
  const fullName = submittedFullName || email.split("@")[0] || "Invigilator";
  const assignedRoomIds = formData
    .getAll("assignedRoomIds")
    .map((value) => String(value))
    .filter(Boolean);
  let accessCode = "";

  try {
    await requireAdminPageUser();

    if (!email) {
      throw new Error("Email is required.");
    }

    const store = await readStore();
    const sessionRoomIds = new Set(
      store.rooms
        .filter((room) => room.examSessionId === sessionId)
        .map((room) => room.id)
    );
    const validAssignedRoomIds = assignedRoomIds.filter((roomId) =>
      sessionRoomIds.has(roomId)
    );

    const result = await createInvigilatorRecord({
      email,
      fullName,
      assignedRoomIds: validAssignedRoomIds
    });
    accessCode = result.accessCode;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create invigilator.";
    redirect(
      `/sessions/new?sessionId=${encodeURIComponent(sessionId)}&error=${encodeURIComponent(
        message
      )}`
    );
  }

  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/sessions/new");
  revalidatePath("/invigilators");
  redirect(
    `/sessions/new?sessionId=${encodeURIComponent(
      sessionId
    )}&message=${encodeURIComponent(
      "Invigilator created and assigned. Share this access code with them."
    )}&accessCode=${encodeURIComponent(accessCode)}&codeEmail=${encodeURIComponent(email)}`
  );
}

export default async function NewSessionPage({
  searchParams
}: {
  searchParams?: Promise<{
    sessionId?: string;
    message?: string;
    error?: string;
    accessCode?: string;
    codeEmail?: string;
  }>;
}) {
  await requireAdminPageUser();
  const params = (await searchParams) || {};
  const store = await readStore();
  const session = params.sessionId
    ? store.examSessions.find((item) => item.id === params.sessionId)
    : null;
  const sessionRooms = session
    ? store.rooms
        .filter((room) => room.examSessionId === session.id)
        .sort((left, right) => left.code.localeCompare(right.code))
    : [];
  const invigilators = store.users
    .filter((user) => user.role === "invigilator")
    .sort((left, right) => left.fullName.localeCompare(right.fullName));

  return (
    <div className="stack">
      <div className="layout-two">
        <div className="card">
          <div className="kicker">Session Setup</div>
          <h2 className="section-title">Add New Exam</h2>
          <NewExamImportForm />
        </div>

        <div className="card tint">
          <div className="kicker">Spreadsheet Contract</div>
          <h2 className="section-title">Required Columns</h2>
          <div className="stack">
            <div className="pill">student_id</div>
            <div className="pill">student_name</div>
            <div className="pill">room</div>
            <div className="pill">zone</div>
          </div>
          <p className="subtle">
            Optional columns: course_code, program. Duplicate student IDs within the
            same exam import are rejected.
          </p>
        </div>
      </div>

      {params.message ? <p className="pill ok">{params.message}</p> : null}
      {params.error ? <p className="pill warn">{params.error}</p> : null}
      {params.accessCode ? (
        <div className="access-code-box">
          <div>
            <div className="kicker">Share This Code</div>
            <div className="access-code-value">{params.accessCode}</div>
          </div>
          <div className="subtle">
            This is shown once. If it is lost, generate a new code from the
            Invigilators page.
          </div>
          {params.codeEmail ? (
            <a
              className="button"
              href={buildAccessCodeMailto(params.codeEmail, params.accessCode)}
            >
              Email Code
            </a>
          ) : null}
        </div>
      ) : null}

      {session ? (
        <div className="card">
          <div className="inline-actions" style={{ justifyContent: "space-between" }}>
            <div>
              <div className="kicker">Same Page Assignment</div>
              <h2 className="section-title">Assign Invigilators To {session.name}</h2>
              <div className="subtle">
                Only rooms from this exam are shown here.
              </div>
            </div>
            <a className="button secondary" href={`/sessions/${session.id}`}>
              Open Full Exam Panel
            </a>
          </div>

          <details className="assignment-details">
            <summary>Add a new invigilator for this exam</summary>
            <form className="assignment-form" action={submitNewExamInvigilator}>
              <input name="sessionId" type="hidden" value={session.id} />
              <input name="email" type="email" placeholder="Email address" required />
              <input name="fullName" placeholder="Full name (optional)" />
              <div className="checkbox-grid compact">
                {sessionRooms.map((room) => (
                  <label key={room.id} className="checkbox-card">
                    <input name="assignedRoomIds" type="checkbox" value={room.id} />
                    <span>
                      <strong>{room.code}</strong>
                      <br />
                      <span className="subtle">{room.displayName}</span>
                    </span>
                  </label>
                ))}
              </div>
              <button type="submit">Create And Assign Invigilator</button>
            </form>
          </details>

          {invigilators.length ? (
            <form className="assignment-form" action={submitNewExamAssignments}>
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
                      <input name="invigilatorIds" type="hidden" value={invigilator.id} />
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
              Add a new invigilator above, then assign them to one or more rooms.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
