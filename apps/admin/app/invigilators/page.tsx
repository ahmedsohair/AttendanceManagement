import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CopyButton } from "@/components/copy-button";
import { EditIcon, KeyIcon, TrashIcon } from "@/components/action-icons";
import { requireAdminPageUser } from "@/lib/auth";
import {
  createInvigilator as createInvigilatorRecord,
  deleteInvigilator,
  resetInvigilatorAccessCode,
  updateInvigilatorDetails
} from "@/lib/repository";
import { buildAccessCodeMailto } from "@/lib/access-code-email";
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
    )}&accessCode=${encodeURIComponent(accessCode)}&codeEmail=${encodeURIComponent(email)}`
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
  const email = String(formData.get("email") || "").trim().toLowerCase();
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
    )}&accessCode=${encodeURIComponent(accessCode)}&codeUserId=${encodeURIComponent(
      userId
    )}&codeEmail=${encodeURIComponent(email)}`
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
    codeEmail?: string;
    q?: string;
  }>;
}) {
  await requireAdminPageUser();
  const params = (await searchParams) || {};
  const staffSearch = (params.q || "").trim().toLowerCase();
  const store = await readStore();
  const invigilators = store.users
    .filter((user) => user.role === "invigilator")
    .filter((user) => {
      if (!staffSearch) {
        return true;
      }

      return (
        user.fullName.toLowerCase().includes(staffSearch) ||
        user.email.toLowerCase().includes(staffSearch)
      );
    })
    .sort((left, right) => left.fullName.localeCompare(right.fullName));

  return (
    <div className="layout-two">
      <div className="card">
        <div className="kicker">Access Management</div>
        <h2 className="section-title">Add Invigilator</h2>
        {params.message ? <p className="pill ok toast-message">{params.message}</p> : null}
        {params.error ? <p className="pill warn toast-message">{params.error}</p> : null}
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
            {params.codeEmail ? (
              <div className="inline-actions">
                <CopyButton value={params.accessCode} />
                <a
                  className="button"
                  href={buildAccessCodeMailto(params.codeEmail, params.accessCode)}
                >
                  Email Code
                </a>
              </div>
            ) : null}
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
        <div className="inline-actions" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="kicker">Current Staff</div>
            <h2 className="section-title">Invigilators</h2>
          </div>
          <form className="search-form" action="/invigilators" method="get">
            <input
              name="q"
              placeholder="Search staff"
              defaultValue={params.q || ""}
            />
            <button className="secondary" type="submit">
              Search
            </button>
          </form>
        </div>
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
                      <summary className="icon-button" title="Access code">
                        <KeyIcon />
                        <span className="sr-only">Access code</span>
                      </summary>
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
                            <div className="inline-actions">
                              <CopyButton
                                className="secondary compact-button"
                                label="Copy"
                                value={params.accessCode}
                              />
                              <a
                                className="button"
                                href={buildAccessCodeMailto(
                                  params.codeEmail || invigilator.email,
                                  params.accessCode
                                )}
                              >
                                Email Code
                              </a>
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
                          <input name="email" type="hidden" value={invigilator.email} />
                          <button type="submit">Generate New Code</button>
                        </form>
                      </div>
                    </details>
                    <details className="inline-details">
                      <summary className="icon-button" title="Edit invigilator">
                        <EditIcon />
                        <span className="sr-only">Edit invigilator</span>
                      </summary>
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
                      <summary className="icon-button danger" title="Delete invigilator">
                        <TrashIcon />
                        <span className="sr-only">Delete invigilator</span>
                      </summary>
                      <div className="inline-popover">
                        <form className="assignment-form" action={submitInvigilatorDelete}>
                          <input name="userId" type="hidden" value={invigilator.id} />
                          <div className="subtle">
                            Deletion is blocked if this invigilator has attendance or
                            incident audit history.
                          </div>
                          <ConfirmSubmitButton
                            className="danger"
                            message={`Delete ${invigilator.fullName}? This is blocked if they have audit history.`}
                          >
                            Delete
                          </ConfirmSubmitButton>
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
                      <div className="inline-actions">
                        <CopyButton
                          className="secondary compact-button"
                          label="Copy"
                          value={params.accessCode}
                        />
                        <a
                          className="button"
                          href={buildAccessCodeMailto(
                            params.codeEmail || invigilator.email,
                            params.accessCode
                          )}
                        >
                          Email Code
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="subtle">
                      Existing access codes are stored securely and cannot be viewed.
                    </div>
                  )}
                  <form className="assignment-form" action={submitAccessCodeReset}>
                    <input name="userId" type="hidden" value={invigilator.id} />
                    <input name="email" type="hidden" value={invigilator.email} />
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
                    <ConfirmSubmitButton
                      className="danger"
                      message={`Delete ${invigilator.fullName}? This is blocked if they have audit history.`}
                    >
                      Delete Invigilator
                    </ConfirmSubmitButton>
                  </form>
                </details>
              </div>
            ))
          ) : (
            <div className="empty-action">
              <strong>No invigilators found</strong>
              <span>
                {staffSearch
                  ? "Try a different staff search."
                  : "Create an invigilator to start assigning exam rooms."}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
