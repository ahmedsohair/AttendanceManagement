import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminPageUser } from "@/lib/auth";
import {
  createInvigilator as createInvigilatorRecord,
  deleteInvigilator,
  resetInvigilatorAccessCode,
  updateInvigilatorDetails
} from "@/lib/repository";
import { readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

async function submitInvigilator(formData: FormData) {
  "use server";

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const submittedFullName = String(formData.get("fullName") || "").trim();
  const fullName = submittedFullName || email.split("@")[0] || "Invigilator";
  let accessCode = "";

  try {
    await requireAdminPageUser();

    if (!email) {
      throw new Error("Email is required.");
    }

    const result = await createInvigilatorRecord({
      email,
      fullName,
      assignedRoomIds: []
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

async function submitInvigilatorDetails(formData: FormData) {
  "use server";

  const userId = String(formData.get("userId") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const fullName = String(formData.get("fullName") || "").trim();

  try {
    await requireAdminPageUser();
    await updateInvigilatorDetails({ userId, email, fullName });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update invigilator.";
    redirect(`/invigilators?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/invigilators");
  redirect("/invigilators?message=Invigilator%20updated.");
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
    )}&accessCode=${encodeURIComponent(accessCode)}&codeUserId=${encodeURIComponent(userId)}`
  );
}

async function submitInvigilatorDelete(formData: FormData) {
  "use server";

  const userId = String(formData.get("userId") || "").trim();

  try {
    await requireAdminPageUser();
    await deleteInvigilator(userId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete invigilator.";
    redirect(`/invigilators?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/invigilators");
  redirect("/invigilators?message=Invigilator%20deleted.");
}

export default async function InvigilatorsPage({
  searchParams
}: {
  searchParams?: Promise<{
    message?: string;
    error?: string;
    accessCode?: string;
    codeUserId?: string;
  }>;
}) {
  await requireAdminPageUser();
  const params = (await searchParams) || {};
  const store = await readStore();
  const invigilators = store.users
    .filter((user) => user.role === "invigilator")
    .sort((left, right) => left.fullName.localeCompare(right.fullName));

  return (
    <div className="layout-two">
      <div className="card">
        <div className="kicker">Access Management</div>
        <h2 className="section-title">Add Invigilator</h2>
        {params.message ? <p className="pill ok">{params.message}</p> : null}
        {params.error ? <p className="pill warn">{params.error}</p> : null}
        {params.accessCode && !params.codeUserId ? (
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
          <button type="submit">Create Invigilator</button>
          <div className="subtle">
            The system generates an access code automatically. The invigilator
            uses only that code in the mobile app. Room access is assigned from
            each exam panel.
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
                  <div className="staff-actions">
                    <details className="inline-details">
                      <summary className="compact-button">Code</summary>
                      <div className="inline-popover">
                        {params.accessCode && params.codeUserId === invigilator.id ? (
                          <div className="access-code-box compact-code-box">
                            <div>
                              <div className="kicker">New Code</div>
                              <div className="access-code-value">{params.accessCode}</div>
                            </div>
                            <div className="subtle">
                              Share this now. Existing codes cannot be viewed later.
                            </div>
                          </div>
                        ) : (
                          <div className="subtle">
                            Existing access codes are stored securely and cannot be
                            viewed. Generate a new code if this invigilator needs access.
                          </div>
                        )}
                        <form className="assignment-form" action={submitAccessCodeReset}>
                          <input name="userId" type="hidden" value={invigilator.id} />
                          <button type="submit">Generate New Code</button>
                        </form>
                      </div>
                    </details>
                    <details className="inline-details">
                      <summary className="compact-button">Edit</summary>
                      <div className="inline-popover">
                        <form className="assignment-form" action={submitInvigilatorDetails}>
                          <input name="userId" type="hidden" value={invigilator.id} />
                          <input
                            name="email"
                            type="email"
                            defaultValue={invigilator.email}
                            placeholder="Email address"
                            required
                          />
                          <input
                            name="fullName"
                            defaultValue={invigilator.fullName}
                            placeholder="Full name"
                          />
                          <button type="submit">Save</button>
                        </form>
                      </div>
                    </details>
                    <details className="inline-details">
                      <summary className="compact-button danger-compact">Delete</summary>
                      <div className="inline-popover">
                        <form className="assignment-form" action={submitInvigilatorDelete}>
                          <input name="userId" type="hidden" value={invigilator.id} />
                          <div className="subtle">
                            Deletion is blocked if this invigilator has attendance or
                            incident audit history.
                          </div>
                          <button className="danger" type="submit">
                            Delete
                          </button>
                        </form>
                      </div>
                    </details>
                  </div>
                </div>

                <details className="assignment-details mobile-details">
                  <summary>Code</summary>
                  {params.accessCode && params.codeUserId === invigilator.id ? (
                    <div className="access-code-box compact-code-box">
                      <div>
                        <div className="kicker">New Code</div>
                        <div className="access-code-value">{params.accessCode}</div>
                      </div>
                      <div className="subtle">
                        Share this now. Existing codes cannot be viewed later.
                      </div>
                    </div>
                  ) : (
                    <div className="subtle">
                      Existing access codes are stored securely and cannot be viewed.
                    </div>
                  )}
                  <form className="assignment-form" action={submitAccessCodeReset}>
                    <input name="userId" type="hidden" value={invigilator.id} />
                    <button type="submit">Generate New Code</button>
                  </form>
                </details>

                <details className="assignment-details mobile-details">
                  <summary>Edit</summary>
                  <form className="assignment-form" action={submitInvigilatorDetails}>
                    <input name="userId" type="hidden" value={invigilator.id} />
                    <input
                      name="email"
                      type="email"
                      defaultValue={invigilator.email}
                      placeholder="Email address"
                      required
                    />
                    <input
                      name="fullName"
                      defaultValue={invigilator.fullName}
                      placeholder="Full name"
                    />
                    <button type="submit">Save Details</button>
                  </form>
                </details>

                <details className="assignment-details danger-details mobile-details">
                  <summary>Delete</summary>
                  <form className="assignment-form" action={submitInvigilatorDelete}>
                    <input name="userId" type="hidden" value={invigilator.id} />
                    <div className="subtle">
                      Deletion is only allowed if this invigilator has not marked
                      attendance or created incidents. If they have audit history,
                      clear their room assignments instead.
                    </div>
                    <button className="danger" type="submit">
                      Delete Invigilator
                    </button>
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
