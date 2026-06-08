import { requireAdminPageUser } from "@/lib/auth";
import { readStore } from "@/lib/store";
import { ExamAssignmentWizard } from "@/components/exam-assignment-wizard";
import { NewExamImportForm } from "@/components/new-exam-import-form";

export const dynamic = "force-dynamic";

export default async function NewSessionPage({
  searchParams
}: {
  searchParams?: Promise<{
    sessionId?: string;
    message?: string;
    error?: string;
  }>;
}) {
  await requireAdminPageUser();
  const params = (await searchParams) || {};
  const store = await readStore();
  const session = params.sessionId
    ? store.examSessions.find((item) => item.id === params.sessionId)
    : null;
  const sessionRooms = session
    ? store.rooms
        .filter((room) => room.examSessionId === session.id)
        .sort((left, right) => left.code.localeCompare(right.code))
    : [];
  const invigilators = store.users
    .filter((user) => user.role === "invigilator")
    .sort((left, right) => left.fullName.localeCompare(right.fullName));

  return (
    <div className="stack">
      <div className="setup-stepper" aria-label="Exam setup progress">
        <div className="setup-step active">
          <span>1</span>
          <strong>Import Roster</strong>
        </div>
        <div className={session ? "setup-step active" : "setup-step"}>
          <span>2</span>
          <strong>Assign Rooms</strong>
        </div>
        <div className={session ? "setup-step" : "setup-step disabled"}>
          <span>3</span>
          <strong>Publish Exam</strong>
        </div>
      </div>

      <div className="layout-two">
        <div className="card">
          <div className="kicker">Session Setup</div>
          <h2 className="section-title">Add New Exam</h2>
          <NewExamImportForm />
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

      {params.message ? <p className="pill ok toast-message">{params.message}</p> : null}
      {params.error ? <p className="pill warn toast-message">{params.error}</p> : null}
      {session ? (
        <>
          <div className="inline-actions" style={{ justifyContent: "space-between" }}>
            <div>
              <div className="kicker">Imported Draft</div>
              <h2 className="section-title">{session.name}</h2>
              <div className="subtle">
                Assign rooms below, save the draft, then continue to review and publish.
              </div>
            </div>
            <a className="button secondary" href={`/sessions/${session.id}`}>
              Open Full Exam Panel
            </a>
          </div>
          <ExamAssignmentWizard
            initialInvigilators={invigilators}
            rooms={sessionRooms}
            sessionId={session.id}
            sessionName={session.name}
            sessionStatus={session.status || (session.published ? "active" : "draft")}
          />
        </>
      ) : null}
    </div>
  );
}
