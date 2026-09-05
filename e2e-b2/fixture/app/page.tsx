"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { ExamAssignmentWizard } from "../../../apps/admin/src/components/exam-assignment-wizard";
import { NewExamImportForm } from "../../../apps/admin/src/components/new-exam-import-form";

type Props = ComponentProps<typeof ExamAssignmentWizard>;
declare global {
  interface Window { setStaffingFixture: (patch: Partial<Props>) => void; }
}

const initial: Props = {
  sessionId: "exam-a", sessionName: "Fixture exam", sessionStatus: "draft", mode: "setup",
  rooms: [{ id: "r1", examSessionId: "exam-a", code: "R1", displayName: "Room One" },
    { id: "r2", examSessionId: "exam-a", code: "R2", displayName: "Room Two" }],
  initialInvigilators: [
    { id: "u1", fullName: "One", email: "one@example.test", role: "invigilator", assignedRoomIds: ["r1", "r2"] },
    { id: "u2", fullName: "Two", email: "two@example.test", role: "invigilator", assignedRoomIds: ["r1"] }
  ],
  populatedRoomIds: ["r1", "r2"]
};

export default function Fixture() {
  const [props, setProps] = useState(initial);
  useEffect(() => { window.setStaffingFixture = (patch) => setProps((current) => ({ ...current, ...patch })); }, []);
  return <>
    <div className="card"><NewExamImportForm /></div>
    <ExamAssignmentWizard {...props} />
  </>;
}
