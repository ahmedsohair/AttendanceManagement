"use client";

import { useState } from "react";

export default function NewSessionPage() {
  const [message, setMessage] = useState<string>("");
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

    const payload = (await response.json()) as { message?: string; sessionId?: string };
    setBusy(false);

    if (!response.ok) {
      setMessage(payload.message || "Import failed.");
      return;
    }

    setMessage(`Imported exam ${payload.sessionId}. Publish it from the dashboard.`);
    formElement.reset();
  }

  return (
    <div className="layout-two">
      <div className="card">
        <div className="kicker">Session Setup</div>
        <h2 className="section-title">Add New Exam</h2>
        <form className="form-grid" onSubmit={handleSubmit}>
          <input name="name" placeholder="Exam name" required />
          <input name="examDate" type="date" required />
          <input name="startTime" type="time" required />
          <input
            name="file"
            type="file"
            accept=".xlsx,.xls,.csv"
            required
          />
          <button type="submit" disabled={busy}>
            {busy ? "Importing..." : "Upload Exam Spreadsheet"}
          </button>
        </form>
        {message ? <p className="subtle">{message}</p> : null}
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
  );
}
