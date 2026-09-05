"use client";

import { useId, useState } from "react";

export function NewExamImportForm() {
  const fieldId = useId();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch("/api/exam-sessions/import", {
      method: "POST",
      body: form
    });
    const payload = (await response.json()) as {
      message?: string;
      sessionId?: string;
      stats?: {
        files: number;
        students: number;
        rooms: number;
      };
    };

    setBusy(false);

    if (!response.ok || !payload.sessionId) {
      setMessage(payload.message || "Import failed.");
      return;
    }

    formElement.reset();
    const statsMessage = payload.stats
      ? `Imported ${payload.stats.students} student(s) across ${payload.stats.rooms} room(s) from ${payload.stats.files} file(s).`
      : "Exam imported.";
    window.location.href = `/sessions/new?sessionId=${encodeURIComponent(
      payload.sessionId
    )}&message=${encodeURIComponent(
      `${statsMessage} Assign invigilators below without leaving this page.`
    )}`;
  }

  return (
    <>
      <form
        className="form-grid"
        onSubmit={handleSubmit}
        aria-describedby={message ? `${fieldId}-error` : undefined}
      >
        <label className="setup-field">
          <span>Exam name</span>
          <input name="name" placeholder="Exam name" required aria-describedby={message ? `${fieldId}-error` : undefined} />
        </label>
        <label className="setup-field">
          <span>Exam date</span>
          <input name="examDate" type="date" required aria-describedby={message ? `${fieldId}-error` : undefined} />
        </label>
        <label className="setup-field">
          <span>Exam start time</span>
          <input name="startTime" type="time" required aria-describedby={message ? `${fieldId}-error` : undefined} />
        </label>
        <label className="setup-field">
          <span>Roster files</span>
          <input
            name="files"
            type="file"
            accept=".xlsx,.csv"
            multiple
            required
            aria-describedby={`${fieldId}-files${message ? ` ${fieldId}-error` : ""}`}
          />
        </label>
        <p id={`${fieldId}-files`} className="subtle">
          Upload .xlsx or .csv files with student_id, student_name, room and zone columns.
          Optional: course_code, program. Duplicate student IDs within the same exam import are rejected.
        </p>
        <button type="submit" disabled={busy}>
          {busy ? "Importing..." : "Upload Exam Spreadsheet(s)"}
        </button>
      </form>
      {message ? <p id={`${fieldId}-error`} role="status" className="pill warn">{message}</p> : null}
    </>
  );
}
