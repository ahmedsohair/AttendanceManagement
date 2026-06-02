import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminPageUser } from "@/lib/auth";
import {
  createInvigilator as createInvigilatorRecord,
  resetInvigilatorAccessCode,
  updateInvigilatorRoomAssignments
} from "@/lib/repository";
import { readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

async function submitInvigilator(formData: FormData) {
  "use server";

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

    const result = await createInvigilatorRecord({
      email,
      fullName,
      assignedRoomIds
    });
    accessCode = result.accessCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create invigilator.";
    redirect(`/invigilators?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/invigilators");
  redirect(
    `/invigilators?message=${encodeURIComponent(
      "Invigilator created. Share this access code with them."
    )}&accessCode=${encodeURIComponent(accessCode)}`
  );
}

async function submitRoomAssignments(formData: FormData) {
  "use server";

  const userId = String(formData.get("userId") || "").trim();
  const assignedRoomIds = formData
    .getAll("assignedRoomIds")
    .map((value) => String(value))
    .filter(Boolean);

  try {
    await requireAdminPageUser();
    await updateInvigilatorRoomAssignments({ userId, assignedRoomIds });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update room assignments.";
    redirect(`/invigilators?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/invigilators");
  redirect("/invigilators?message=Room%20assignments%20updated.");
}

async function submitAccessCodeReset(formData: FormData) {
  "use server";

  const userId = String(formData.get("userId") || "").trim();
  let accessCode = "";

  try {
    await requireAdminPageUser();
    const result = await resetInvigilatorAccessCode(userId);
    accessCode = result.accessCode;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to generate access code.";
    redirect(`/invigilators?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/invigilators");
  redirect(
    `/invigilators?message=${encodeURIComponent(
      "New invigilator access code generated."
    )}&accessCode=${encodeURIComponent(accessCode)}`
  );
}

export default async function InvigilatorsPage({
  searchParams
}: {
  searchParams?: Promise<{ message?: string; error?: string; accessCode?: string }>;
}) {
  await requireAdminPageUser();
  const params = (await searchParams) || {};
  const store = await readStore();
  const invigilators = store.users
    .filter((user) => user.role === "invigilator")
    .sort((left, right) => left.fullName.localeCompare(right.fullName));

  const availableRooms = store.rooms
    .map((room) => ({
      ...room,
      session: store.examSessions.find((session) => session.id === room.examSessionId)
    }))
    .filter((room) => room.session)
    .sort((left, right) =>
      `${left.session?.examDate}-${left.session?.startTime}-${left.code}`.localeCompare(
        `${right.session?.examDate}-${right.session?.startTime}-${right.code}`
      )
    );

  return (
    <div className="layout-two">
      <div className="card">
        <div className="kicker">Access Management</div>
        <h2 className="section-title">Add Invigilator</h2>
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
              invigilator card.
            </div>
          </div>
        ) : null}
        <form className="form-grid" action={submitInvigilator}>
          <input name="email" type="email" placeholder="Email address" required />
          <input name="fullName" placeholder="Full name (optional)" />
          <div>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Assign Rooms</div>
            <div className="checkbox-grid">
              {availableRooms.length ? (
                availableRooms.map((room) => (
                  <label key={room.id} className="checkbox-card">
                    <input name="assignedRoomIds" type="checkbox" value={room.id} />
                    <span>
                      <strong>{room.code}</strong>
                      <br />
                      <span className="subtle">
                        {room.session?.name} | {room.session?.examDate}
                      </span>
                    </span>
                  </label>
                ))
              ) : (
                <div className="subtle">
                  Add an exam first to assign room access.
                </div>
              )}
            </div>
          </div>
          <button type="submit">Create Invigilator</button>
          <div className="subtle">
            The system generates an access code automatically. The invigilator
            uses only that code in the mobile app.
          </div>
        </form>
      </div>

      <div className="card tint">
        <div className="kicker">Current Staff</div>
        <h2 className="section-title">Invigilators</h2>
        <div className="detail-list">
          {invigilators.length ? (
            invigilators.map((invigilator) => (
              <div key={invigilator.id} className="detail-row stacked">
                <div className="detail-row-main">
                  <div>
                    <div style={{ fontWeight: 700 }}>{invigilator.fullName}</div>
                    <div className="subtle">{invigilator.email}</div>
                  </div>
                  <div className="pill">
                    {invigilator.assignedRoomIds.length
                      ? `${invigilator.assignedRoomIds.length} room(s)`
                      : "No rooms assigned"}
                  </div>
                </div>

                <form action={submitAccessCodeReset} className="inline-actions">
                  <input name="userId" type="hidden" value={invigilator.id} />
                  <button className="secondary" type="submit">
                    Generate New Code
                  </button>
                </form>

                <details className="assignment-details">
                  <summary>Edit room assignments</summary>
                  <form className="assignment-form" action={submitRoomAssignments}>
                    <input name="userId" type="hidden" value={invigilator.id} />
                    <div className="checkbox-grid compact">
                      {availableRooms.map((room) => (
                        <label key={room.id} className="checkbox-card">
                          <input
                            name="assignedRoomIds"
                            type="checkbox"
                            value={room.id}
                            defaultChecked={invigilator.assignedRoomIds.includes(room.id)}
                          />
                          <span>
                            <strong>{room.code}</strong>
                            <br />
                            <span className="subtle">
                              {room.session?.name} | {room.session?.examDate}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="subtle">
                      If no rooms are selected, this invigilator will not see any room
                      in the mobile app.
                    </div>
                    <button type="submit">Save Assignments</button>
                  </form>
                </details>
              </div>
            ))
          ) : (
            <div className="subtle">No invigilators have been added yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
