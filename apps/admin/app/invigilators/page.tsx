import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminPageUser } from "@/lib/auth";
import {
  createInvigilator as createInvigilatorRecord,
  updateInvigilatorRoomAssignments
} from "@/lib/repository";
import { readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

async function submitInvigilator(formData: FormData) {
  "use server";

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const fullName = String(formData.get("fullName") || "").trim();
  const assignedRoomIds = formData
    .getAll("assignedRoomIds")
    .map((value) => String(value))
    .filter(Boolean);
  const password = String(formData.get("password") || "");

  try {
    await requireAdminPageUser();

    if (!email || !fullName || password.length < 8) {
      throw new Error(
        "Full name, email, and a password with at least 8 characters are required."
      );
    }

    await createInvigilatorRecord({
      email,
      fullName,
      assignedRoomIds,
      password
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create invigilator.";
    redirect(`/invigilators?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/invigilators");
  redirect("/invigilators?message=Invigilator%20created.");
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

export default async function InvigilatorsPage({
  searchParams
}: {
  searchParams?: Promise<{ message?: string; error?: string }>;
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
        <form className="form-grid" action={submitInvigilator}>
          <input name="fullName" placeholder="Full name" required />
          <input name="email" type="email" placeholder="Email address" required />
          <input
            name="password"
            type="password"
            placeholder="Temporary password"
            minLength={8}
            required
          />
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
            Assign at least one room before the exam starts. Use the assignment editor
            below when a new exam is added later.
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
