"use client";

import { useState } from "react";

export function NewExamImportForm() {
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
      <form className="form-grid" onSubmit={handleSubmit}>
        <input name="name" placeholder="Exam name" required />
        <input name="examDate" type="date" required />
        <input name="startTime" type="time" required />
        <input name="files" type="file" accept=".xlsx,.csv" multiple required />
        <button type="submit" disabled={busy}>
          {busy ? "Importing..." : "Upload Exam Spreadsheet(s)"}
        </button>
      </form>
      {message ? <p className="pill warn">{message}</p> : null}
    </>
  );
}
