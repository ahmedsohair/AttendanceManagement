import { revalidatePath } from "next/cache";
import { requireAdminPageUser } from "@/lib/auth";
import { createInvigilator as createInvigilatorRecord } from "@/lib/repository";
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

  await requireAdminPageUser();

  if (!email || !fullName || password.length < 8) {
    throw new Error("Full name, email, and a password with at least 8 characters are required.");
  }

  await createInvigilatorRecord({
    email,
    fullName,
    assignedRoomIds,
    password
  });
  revalidatePath("/invigilators");
}

export default async function InvigilatorsPage() {
  await requireAdminPageUser();
  const store = await readStore();
  const invigilators = store.users
    .filter((user) => user.role === "invigilator")
    .sort((left, right) => left.fullName.localeCompare(right.fullName));

  const roomMap = new Map(store.rooms.map((room) => [room.id, room]));
  const availableRooms = store.rooms
    .map((room) => ({
      ...room,
      session: store.examSessions.find((session) => session.id === room.examSessionId)
    }))
    .filter((room) => room.session)
    .sort((left, right) =>
      `${left.session?.examDate}-${left.code}`.localeCompare(
        `${right.session?.examDate}-${right.code}`
      )
    );

  return (
    <div className="layout-two">
      <div className="card">
        <div className="kicker">Access Management</div>
        <h2 className="section-title">Add Invigilator</h2>
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
                  Add and publish an exam first to assign room access.
                </div>
              )}
            </div>
          </div>
          <button type="submit">Create Invigilator</button>
          <div className="subtle">
            Leave room assignments empty if the invigilator should see all published
            rooms. Share the temporary password securely with the invigilator after
            creating the account.
          </div>
        </form>
      </div>

      <div className="card tint">
        <div className="kicker">Current Staff</div>
        <h2 className="section-title">Invigilators</h2>
        <div className="detail-list">
          {invigilators.length ? (
            invigilators.map((invigilator) => (
              <div key={invigilator.id} className="detail-row">
                <div>
                  <div style={{ fontWeight: 700 }}>{invigilator.fullName}</div>
                  <div className="subtle">{invigilator.email}</div>
                </div>
                <div className="subtle" style={{ maxWidth: 320, textAlign: "right" }}>
                  {invigilator.assignedRoomIds.length
                    ? invigilator.assignedRoomIds
                        .map((roomId) => roomMap.get(roomId)?.code || roomId)
                        .join(", ")
                    : "All published rooms"}
                </div>
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
