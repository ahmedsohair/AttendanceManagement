"use client";

import { useMemo, useState } from "react";
import type { ExamSessionStatus, Room, User } from "@algo-attendance/shared";
import { CopyButton } from "./copy-button";

type ExamAssignmentWizardProps = {
  initialInvigilators: User[];
  rooms: Room[];
  mode?: "setup" | "manage";
  sessionId: string;
  sessionName: string;
  sessionStatus: ExamSessionStatus;
};

type Notice = {
  tone: "ok" | "warn";
  text: string;
};

function buildInitialAssignments(rooms: Room[], invigilators: User[]) {
  const assignments: Record<string, string[]> = {};

  for (const room of rooms) {
    assignments[room.id] = invigilators
      .filter((invigilator) => invigilator.assignedRoomIds.includes(room.id))
      .map((invigilator) => invigilator.id);
  }

  return assignments;
}

function buildAssignmentRecord(
  rooms: Room[],
  assignments: Array<{ roomId: string; invigilatorIds: string[] }>
) {
  const record = Object.fromEntries(rooms.map((room) => [room.id, [] as string[]]));

  for (const assignment of assignments) {
    if (assignment.roomId in record) {
      record[assignment.roomId] = [...assignment.invigilatorIds];
    }
  }

  return record;
}

async function readJsonResponse(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as { message?: string };

  if (!response.ok) {
    throw new Error(payload.message || "Request failed.");
  }

  return payload;
}

type EmailJob = {
  acceptedCount: number;
  failedCount: number;
  jobId: string;
  processedCount: number;
  status: "queued" | "processing" | "completed" | "partial" | "failed";
  totalCount: number;
};

type EmailDelivery = {
  acceptedAt: string | null;
  attemptCount: number;
  deliveredAt: string | null;
  failureReason: string | null;
  id: string;
  provider: "resend" | "smtp" | null;
  recipientEmail: string;
  status:
    | "queued"
    | "sending"
    | "accepted"
    | "delivered"
    | "bounced"
    | "complained"
    | "failed"
    | "unknown";
};

type EmailReport = {
  deliveries: EmailDelivery[];
  job: EmailJob;
};

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function ExamAssignmentWizard({
  initialInvigilators,
  mode = "manage",
  rooms,
  sessionId,
  sessionName,
  sessionStatus
}: ExamAssignmentWizardProps) {
  const [assignments, setAssignments] = useState(() =>
    buildInitialAssignments(rooms, initialInvigilators)
  );
  const [savedAssignments, setSavedAssignments] = useState(() =>
    buildInitialAssignments(rooms, initialInvigilators)
  );
  const [invigilators, setInvigilators] = useState(initialInvigilators);
  const [selectedRoomId, setSelectedRoomId] = useState(rooms[0]?.id || "");
  const [query, setQuery] = useState("");
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [createdAccess, setCreatedAccess] = useState<{
    accessCode: string;
    email: string;
    userId: string;
  } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dirty, setDirty] = useState(false);
  const [reviewMode, setReviewMode] = useState(mode === "setup" ? false : true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isEmailing, setIsEmailing] = useState(false);
  const [isEmailingCode, setIsEmailingCode] = useState(false);
  const [emailReport, setEmailReport] = useState<EmailReport | null>(null);
  const [selectedFailedDeliveries, setSelectedFailedDeliveries] = useState<string[]>([]);

  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) || rooms[0];
  const isSetupMode = mode === "setup";
  const isReadOnly = sessionStatus === "closed";
  const canPublish = isSetupMode && sessionStatus === "draft";
  const filteredInvigilators = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return invigilators;
    }

    return invigilators.filter((invigilator) =>
      `${invigilator.fullName} ${invigilator.email}`
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [invigilators, query]);
  const assignedInvigilatorIds = selectedRoom ? assignments[selectedRoom.id] || [] : [];
  const assignedCount = rooms.reduce(
    (count, room) => count + ((assignments[room.id] || []).length ? 1 : 0),
    0
  );
  const unassignedRooms = rooms.filter((room) => !(assignments[room.id] || []).length);

  function toggleRoomInvigilator(roomId: string, invigilatorId: string) {
    if (isReadOnly) {
      return;
    }

    setAssignments((current) => {
      const currentRoomAssignments = current[roomId] || [];
      const nextRoomAssignments = currentRoomAssignments.includes(invigilatorId)
        ? currentRoomAssignments.filter((candidate) => candidate !== invigilatorId)
        : [...currentRoomAssignments, invigilatorId];

      return {
        ...current,
        [roomId]: nextRoomAssignments
      };
    });
    setDirty(true);
    setNotice(null);
  }

  function saveAssignments() {
    setIsSaving(true);
    void (async () => {
      try {
        await saveAssignmentsRequest();
      } catch {
        // saveAssignmentsRequest already exposes the error in the notice area.
      } finally {
        setIsSaving(false);
      }
    })();
  }

  async function saveAssignmentsRequest() {
    try {
      const payload = (await readJsonResponse(
        await fetch(`/api/exam-sessions/${sessionId}/assignments`, {
          body: JSON.stringify({
            expectedRoomAssignments: rooms.map((room) => ({
              roomId: room.id,
              invigilatorIds: savedAssignments[room.id] || []
            })),
            roomAssignments: rooms.map((room) => ({
              roomId: room.id,
              invigilatorIds: assignments[room.id] || []
            }))
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        })
      )) as {
        roomAssignments?: Array<{ roomId: string; invigilatorIds: string[] }>;
      };

      if (!payload.roomAssignments) {
        throw new Error("Assignments were saved but the committed snapshot was not returned.");
      }

      const committedAssignments = buildAssignmentRecord(rooms, payload.roomAssignments);
      setAssignments(committedAssignments);
      setSavedAssignments(committedAssignments);
      setDirty(false);
      setNotice({ tone: "ok", text: "Room assignments saved." });
    } catch (error) {
      setNotice({
        tone: "warn",
        text: error instanceof Error ? error.message : "Unable to save assignments."
      });
      throw error;
    }
  }

  function createInvigilator() {
    if (!selectedRoom || isReadOnly) {
      return;
    }

    setIsCreating(true);
    void (async () => {
      try {
        const payload = (await readJsonResponse(
          await fetch("/api/invigilators", {
            body: JSON.stringify({
              assignedRoomIds: [],
              email: newEmail,
              fullName: newName
            }),
            headers: {
              "Content-Type": "application/json"
            },
            method: "POST"
          })
        )) as {
          accessCode?: string;
          user?: User;
        };

        if (!payload.user || !payload.accessCode) {
          throw new Error("Invigilator was created but could not be loaded.");
        }

        setInvigilators((current) =>
          [...current, payload.user as User].sort((left, right) =>
            left.fullName.localeCompare(right.fullName)
          )
        );
        setAssignments((current) => ({
          ...current,
          [selectedRoom.id]: Array.from(
            new Set([...(current[selectedRoom.id] || []), (payload.user as User).id])
          )
        }));
        setCreatedAccess({
          accessCode: payload.accessCode,
          email: payload.user.email,
          userId: payload.user.id
        });
        setNewEmail("");
        setNewName("");
        setShowCreatePanel(false);
        setDirty(true);
        setNotice({
          tone: "ok",
          text: `Invigilator created and staged for ${selectedRoom.code}. Save assignments to apply access.`
        });
      } catch (error) {
        setNotice({
          tone: "warn",
          text: error instanceof Error ? error.message : "Unable to create invigilator."
        });
      } finally {
        setIsCreating(false);
      }
    })();
  }

  function publishExam() {
    setIsPublishing(true);
    void (async () => {
      try {
        if (dirty) {
          await saveAssignmentsRequest();
        }

        const response = await fetch(`/api/exam-sessions/${sessionId}/publish`, {
          method: "POST"
        });

        if (!response.ok && response.headers.get("content-type")?.includes("json")) {
          await readJsonResponse(response);
        }

        window.location.assign(`/sessions/${sessionId}`);
      } catch (error) {
        setNotice({
          tone: "warn",
          text: error instanceof Error ? error.message : "Unable to publish exam."
        });
        setIsPublishing(false);
      }
    })();
  }

  function emailInvigilators() {
    if (dirty) {
      setNotice({
        tone: "warn",
        text: "Save assignment changes before emailing invigilators."
      });
      return;
    }

    const confirmed = window.confirm(
      "Email assignment details to the assigned invigilators now? Their existing access codes will remain unchanged."
    );

    if (!confirmed) {
      return;
    }

    setIsEmailing(true);
    void (async () => {
      try {
        const requestId = crypto.randomUUID();
        const payload = (await readJsonResponse(
          await fetch(`/api/exam-sessions/${sessionId}/email-instructions`, {
            headers: { "Idempotency-Key": requestId },
            method: "POST"
          })
        )) as { job?: EmailJob; message?: string };

        if (!payload.job) {
          setNotice({
            tone: "ok",
            text: payload.message || "Invigilator emails sent."
          });
          return;
        }

        const job = await processQueuedEmailJob(payload.job);

        setNotice({
          tone: job.failedCount ? "warn" : "ok",
          text: job.failedCount
            ? `${job.acceptedCount} email(s) accepted; ${job.failedCount} failed.`
            : `${job.acceptedCount} invigilator email(s) accepted by the email provider.`
        });
        await loadEmailReport(job.jobId);
      } catch (error) {
        setNotice({
          tone: "warn",
          text: error instanceof Error ? error.message : "Unable to email invigilators."
        });
      } finally {
        setIsEmailing(false);
      }
    })();
  }

  async function processQueuedEmailJob(initialJob: EmailJob) {
    let job = initialJob;
    setNotice({
      tone: "ok",
      text: `Sending ${job.processedCount} of ${job.totalCount} invigilator email(s)...`
    });

    while (job.status === "queued" || job.status === "processing") {
      const batch = (await readJsonResponse(
        await fetch(`/api/email-jobs/${job.jobId}/process`, { method: "POST" })
      )) as { job: EmailJob; processed: number };
      job = batch.job;
      setNotice({
        tone: job.failedCount ? "warn" : "ok",
        text: `Processed ${job.processedCount} of ${job.totalCount} email(s)...`
      });

      if ((job.status === "queued" || job.status === "processing") && !batch.processed) {
        await wait(2000);
      }
    }

    return job;
  }

  async function loadEmailReport(jobId: string) {
    const report = (await readJsonResponse(
      await fetch(`/api/email-jobs/${jobId}`, { cache: "no-store" })
    )) as EmailReport;
    setEmailReport(report);
    setSelectedFailedDeliveries((current) =>
      current.filter((deliveryId) =>
        report.deliveries.some(
          (delivery) => delivery.id === deliveryId && delivery.status === "failed"
        )
      )
    );
  }

  function retrySelectedEmails() {
    if (!emailReport || !selectedFailedDeliveries.length) {
      return;
    }

    setIsEmailing(true);
    void (async () => {
      try {
        await readJsonResponse(
          await fetch(`/api/email-jobs/${emailReport.job.jobId}/retry`, {
            body: JSON.stringify({ deliveryIds: selectedFailedDeliveries }),
            headers: { "Content-Type": "application/json" },
            method: "POST"
          })
        );
        const refreshed = (await readJsonResponse(
          await fetch(`/api/email-jobs/${emailReport.job.jobId}`, { cache: "no-store" })
        )) as EmailReport;
        const job = await processQueuedEmailJob(refreshed.job);
        await loadEmailReport(job.jobId);
        setNotice({
          tone: job.failedCount ? "warn" : "ok",
          text: job.failedCount
            ? `${job.acceptedCount} email(s) accepted; ${job.failedCount} still failed.`
            : `${job.acceptedCount} invigilator email(s) accepted by the email provider.`
        });
      } catch (error) {
        setNotice({
          tone: "warn",
          text: error instanceof Error ? error.message : "Unable to retry emails."
        });
      } finally {
        setIsEmailing(false);
      }
    })();
  }

  function emailCreatedAccessCode() {
    if (!createdAccess) {
      return;
    }

    setIsEmailingCode(true);
    void (async () => {
      try {
        const payload = await readJsonResponse(
          await fetch("/api/invigilators/email-code", {
            body: JSON.stringify({
              accessCode: createdAccess.accessCode,
              email: createdAccess.email,
              userId: createdAccess.userId
            }),
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": crypto.randomUUID()
            },
            method: "POST"
          })
        );
        setNotice({
          tone: "ok",
          text: payload.message || "Access code emailed."
        });
      } catch (error) {
        setNotice({
          tone: "warn",
          text: error instanceof Error ? error.message : "Unable to email access code."
        });
      } finally {
        setIsEmailingCode(false);
      }
    })();
  }

  return (
    <section className="assignment-workflow card">
      <div className="assignment-workflow-header">
        <div>
          <div className="kicker">{isSetupMode ? "Step 2" : "Room Access"}</div>
          <h2 className="section-title">
            {isSetupMode ? "Assign Invigilators" : "Invigilator Assignments"}
          </h2>
          <div className="subtle">
            {isSetupMode
              ? `${assignedCount} of ${rooms.length} room(s) have staff assigned.`
              : isReadOnly
                ? `${assignedCount} of ${rooms.length} room(s) had assigned staff when reviewed.`
                : `${assignedCount} of ${rooms.length} room(s) currently have assigned staff.`}
          </div>
        </div>
        <div className={unassignedRooms.length ? "pill warn" : "pill ok"}>
          {unassignedRooms.length
            ? `${unassignedRooms.length} unassigned room(s)`
            : "All rooms assigned"}
        </div>
      </div>

      {notice ? <p className={`pill ${notice.tone} toast-message`}>{notice.text}</p> : null}

      {emailReport ? (
        <div className="email-delivery-report">
          <div className="assignment-panel-title">
            <div>
              <strong>Email delivery status</strong>
              <span className="subtle">
                Accepted means the provider received the email; only Delivered confirms
                downstream delivery.
              </span>
            </div>
            <div className="inline-actions">
              <button
                className="secondary compact-button"
                disabled={isEmailing}
                type="button"
                onClick={() => void loadEmailReport(emailReport.job.jobId)}
              >
                Refresh Status
              </button>
              <button
                className="secondary compact-button"
                disabled={isEmailing || !selectedFailedDeliveries.length}
                type="button"
                onClick={retrySelectedEmails}
              >
                Retry Selected Failed
              </button>
            </div>
          </div>
          <div className="table-scroll">
            <table className="table compact-table">
              <thead>
                <tr>
                  <th aria-label="Select failed email" />
                  <th>Recipient</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {emailReport.deliveries.map((delivery) => {
                  const retryable = delivery.status === "failed";
                  const tone =
                    delivery.status === "accepted" || delivery.status === "delivered"
                      ? "ok"
                      : delivery.status === "failed" ||
                          delivery.status === "bounced" ||
                          delivery.status === "complained"
                        ? "danger"
                        : "warn";

                  return (
                    <tr key={delivery.id}>
                      <td>
                        <input
                          aria-label={`Retry ${delivery.recipientEmail}`}
                          checked={selectedFailedDeliveries.includes(delivery.id)}
                          disabled={!retryable || isEmailing}
                          type="checkbox"
                          onChange={(event) =>
                            setSelectedFailedDeliveries((current) =>
                              event.target.checked
                                ? [...current, delivery.id]
                                : current.filter((id) => id !== delivery.id)
                            )
                          }
                        />
                      </td>
                      <td>{delivery.recipientEmail}</td>
                      <td>
                        <span className={`pill ${tone}`}>{delivery.status}</span>
                      </td>
                      <td>{delivery.attemptCount}</td>
                      <td className="subtle">{delivery.failureReason || delivery.provider || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {createdAccess ? (
        <div className="access-code-box compact-code-box">
          <div>
            <div className="kicker">Share New Access Code</div>
            <div className="access-code-value">{createdAccess.accessCode}</div>
          </div>
          <div className="inline-actions">
            <CopyButton
              className="secondary compact-button"
              label="Copy"
              value={createdAccess.accessCode}
            />
            <button
              type="button"
              onClick={emailCreatedAccessCode}
              disabled={isEmailingCode}
            >
              {isEmailingCode ? "Emailing..." : "Email Code"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="assignment-board">
        <div className="room-list-panel">
          <div className="assignment-panel-title">
            <strong>Rooms</strong>
            <span className="subtle">Select a room to edit assignments.</span>
          </div>
          <div className="room-card-list">
            {rooms.map((room) => {
              const roomAssignments = assignments[room.id] || [];
              const selected = room.id === selectedRoom?.id;

              return (
                <button
                  key={room.id}
                  className={selected ? "room-assignment-card selected" : "room-assignment-card"}
                  type="button"
                  onClick={() => {
                    setSelectedRoomId(room.id);
                    setReviewMode(false);
                  }}
                >
                  <span>
                    <strong>{room.code}</strong>
                    <span>{room.displayName}</span>
                  </span>
                  <span className={roomAssignments.length ? "pill ok" : "pill warn"}>
                    {roomAssignments.length
                      ? `${roomAssignments.length} assigned`
                      : "Unassigned"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="room-editor-panel">
          {reviewMode ? (
            <div className="review-panel">
              <div className="kicker">{isSetupMode ? "Step 3" : "Assignment Summary"}</div>
              <h3 className="section-title">
                {isSetupMode ? "Review & Publish" : "Room Access Summary"}
              </h3>
              {isReadOnly ? (
                <p className="subtle">
                  This exam is closed. Assignments are shown for audit context and cannot
                  be edited.
                </p>
              ) : null}
              <div className="stack">
                {rooms.map((room) => {
                  const roomAssignments = assignments[room.id] || [];
                  const assignedNames = roomAssignments
                    .map((userId) => invigilators.find((user) => user.id === userId)?.fullName)
                    .filter(Boolean);

                  return (
                    <div key={room.id} className="review-room-row">
                      <div>
                        <strong>{room.code}</strong>
                        <span className="subtle">{room.displayName}</span>
                      </div>
                      <div>
                        {assignedNames.length ? (
                          assignedNames.map((name) => (
                            <span key={name} className="pill ok">
                              {name}
                            </span>
                          ))
                        ) : (
                          <span className="pill warn">No invigilator</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : selectedRoom ? (
            <>
              <div className="assignment-panel-title">
                <div>
                  <strong>{selectedRoom.code}</strong>
                  <span className="subtle">{selectedRoom.displayName}</span>
                </div>
                <button
                  className="secondary"
                  disabled={isReadOnly}
                  type="button"
                  onClick={() => setShowCreatePanel((current) => !current)}
                >
                  Add New Invigilator
                </button>
              </div>

              {showCreatePanel ? (
                <div className="inline-create-panel">
                  <input
                    type="email"
                    value={newEmail}
                    placeholder="Email address"
                    onChange={(event) => setNewEmail(event.target.value)}
                  />
                  <input
                    value={newName}
                    placeholder="Full name (optional)"
                    onChange={(event) => setNewName(event.target.value)}
                  />
                  <button disabled={isCreating || !newEmail.trim()} type="button" onClick={createInvigilator}>
                    {isCreating ? "Creating..." : `Create & Add To ${selectedRoom.code}`}
                  </button>
                </div>
              ) : null}

              <input
                type="search"
                value={query}
                placeholder="Search invigilators"
                onChange={(event) => setQuery(event.target.value)}
              />

              <div className="selected-staff-strip">
                {assignedInvigilatorIds.length ? (
                  assignedInvigilatorIds.map((userId) => {
                    const invigilator = invigilators.find((user) => user.id === userId);

                    return invigilator ? (
                      <button
                        key={userId}
                        className="staff-chip"
                        type="button"
                        onClick={() => toggleRoomInvigilator(selectedRoom.id, userId)}
                      >
                        {invigilator.fullName} x
                      </button>
                    ) : null;
                  })
                ) : (
                  <span className="subtle">No invigilator assigned to this room yet.</span>
                )}
              </div>

              <div className="staff-picker-list">
                {filteredInvigilators.map((invigilator) => {
                  const checked = assignedInvigilatorIds.includes(invigilator.id);

                  return (
                    <label
                      key={invigilator.id}
                      className={checked ? "staff-picker-row selected" : "staff-picker-row"}
                    >
                      <input
                        type="checkbox"
                        disabled={isReadOnly}
                        checked={checked}
                        onChange={() =>
                          toggleRoomInvigilator(selectedRoom.id, invigilator.id)
                        }
                      />
                      <span>
                        <strong>{invigilator.fullName}</strong>
                        <span className="subtle">{invigilator.email}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="subtle">No rooms available for this exam.</div>
          )}
        </div>
      </div>

      <div className="assignment-sticky-bar">
        <div>
          <strong>
            {isReadOnly
              ? "Closed exam assignments"
              : dirty
                ? "Unsaved assignment changes"
                : "Assignments up to date"}
          </strong>
          <span className="subtle">
            {isReadOnly
              ? `${sessionName} is read-only.`
              : `${sessionName} is currently ${sessionStatus}.`}
          </span>
        </div>
        {!isReadOnly ? (
          <div className="inline-actions">
          <button
            className="secondary"
            disabled={isSaving || !dirty}
            type="button"
            onClick={saveAssignments}
          >
            {isSaving ? "Saving..." : isSetupMode ? "Save Draft" : "Save Changes"}
          </button>
          <button
            className="secondary"
            disabled={isSaving || isEmailing || dirty || !assignedCount}
            title={dirty ? "Save assignments before emailing" : "Email assigned invigilators"}
            type="button"
            onClick={emailInvigilators}
          >
            {isEmailing ? "Emailing..." : "Email Invigilators"}
          </button>
          {isSetupMode ? (
            <button
              className="secondary"
              disabled={isSaving}
              type="button"
              onClick={() => setReviewMode(true)}
            >
              Continue To Review
            </button>
          ) : null}
          {canPublish ? (
            <button
              disabled={isSaving || isPublishing}
              title={dirty ? "Save assignments and publish exam" : "Publish exam"}
              type="button"
              onClick={publishExam}
            >
              {isPublishing ? "Publishing..." : dirty ? "Save & Publish Exam" : "Publish Exam"}
            </button>
          ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
