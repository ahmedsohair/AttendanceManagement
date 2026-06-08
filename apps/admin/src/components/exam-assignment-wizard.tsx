"use client";

import { useMemo, useState } from "react";
import type { ExamSessionStatus, Room, User } from "@algo-attendance/shared";
import { buildAccessCodeMailto } from "@/lib/access-code-email";
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

async function readJsonResponse(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as { message?: string };

  if (!response.ok) {
    throw new Error(payload.message || "Request failed.");
  }

  return payload;
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
  } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dirty, setDirty] = useState(false);
  const [reviewMode, setReviewMode] = useState(mode === "setup" ? false : true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

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
      await readJsonResponse(
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
      );
      setSavedAssignments(assignments);
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
          email: payload.user.email
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
            <a
              className="button"
              href={buildAccessCodeMailto(createdAccess.email, createdAccess.accessCode)}
            >
              Email Code
            </a>
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
