import { cookies } from "next/headers";

const names = ["Algorithms and Analysis - Undergraduate and Postgraduate Final Examination", "Database Systems", "Software Engineering", "Computing Theory"];
const sessions = (status: string) => Array.from({ length: 7 }, (_, index) => ({
  id: `${status}-${index + 1}`,
  name: `${names[index % names.length]} ${index + 1}`,
  examDate: "2026-09-08",
  startTime: "09:30",
  status,
  roomCount: index + 2
}));
async function isEmpty() { return (await cookies()).get("ui-fixture-state")?.value === "empty"; }

export async function getDashboardData() {
  const empty = await isEmpty();
  const activeSessions = empty ? [] : sessions("active").slice(0, 3);
  const draftSessions = empty ? [] : sessions("draft").slice(0, 2);
  const closedSessions = empty ? [] : sessions("closed").slice(0, 2);
  return {
    activeSessions, draftSessions, closedSessions,
    activeSessionCount: empty ? 0 : 7,
    draftSessionCount: empty ? 0 : 7,
    overall: { present: empty ? 0 : 12580, mismatch: empty ? 0 : 17, incidents: empty ? 0 : 28 },
    needsAttention: empty ? [] : [
      { label: "Unassigned rooms", detail: "Review room staffing before the exam starts.", tone: "warn", href: "/sessions" },
      { label: "Wrong-room attendance", detail: "Review attendance marked outside assigned rooms.", tone: "danger", href: "/mismatches" }
    ],
    roomCountBySessionId: new Map([...activeSessions, ...draftSessions, ...closedSessions].map(s => [s.id, s.roomCount]))
  };
}
export async function getExamSessionPage({ status, query, sort, page }: { status: string; query: string; sort: string; page: number }) {
  let rows = await isEmpty() ? [] : sessions(status);
  if (query) rows = rows.filter(s => `${s.name} ${s.examDate}`.toLowerCase().includes(query.toLowerCase()));
  if (sort === "oldest") rows = [...rows].reverse();
  const totalCount = rows.length;
  const pageSize = 3;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const current = Math.min(page, totalPages);
  return { rows: rows.slice((current - 1) * pageSize, current * pageSize), page: current, pageSize, totalCount, totalPages };
}
