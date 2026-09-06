import Link from "next/link";
import type { ReactNode } from "react";

type AuditKind = "attendance" | "incidents" | "mismatches";
type SearchParams = Record<string, string | undefined>;

const sessions = [
  ["exam-a", "Fixture exam A"],
  ["exam-b", "Fixture exam B"]
] as const;
const rooms = ["R1", "R2"];

function queryValue(params: SearchParams, key: string, fallback = "") {
  return params[key] || fallback;
}

function pageHref(path: string, params: SearchParams, page: number) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key !== "page" && value) query.set(key, value);
  }
  if (page > 1) query.set("page", String(page));
  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}

function attendanceHref(examSessionId: string) {
  return `/attendance?${new URLSearchParams({ examSessionId }).toString()}`;
}

function FilterField({
  id,
  label,
  children,
  search = false
}: {
  id: string;
  label: string;
  children: ReactNode;
  search?: boolean;
}) {
  return (
    <div className={search ? "filter-field filter-field-search" : "filter-field"}>
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

function SessionOptions() {
  return (
    <>
      <option value="active">Active exams only</option>
      <option value="all">All exams</option>
      {sessions.map(([id, name]) => (
        <option key={id} value={id}>{name} (active)</option>
      ))}
    </>
  );
}

function AuditFilters({ kind, params }: { kind: AuditKind; params: SearchParams }) {
  const path = `/${kind}`;
  const examSessionId = queryValue(params, "examSessionId", "active");
  const room = queryValue(params, "room");
  const sort = queryValue(params, "sort", "newest");
  const query = queryValue(params, "q");
  const status = queryValue(params, "status");
  const type = queryValue(params, "type");

  return (
    <form className="search-form table-filter-form" action={path} method="get">
      <FilterField id={`${kind}-filter-exam`} label="Exam">
        <select id={`${kind}-filter-exam`} name="examSessionId" defaultValue={examSessionId}>
          <SessionOptions />
        </select>
      </FilterField>
      <FilterField id={`${kind}-filter-search`} label="Search" search>
        <input id={`${kind}-filter-search`} name="q" placeholder="Student, name or comment" defaultValue={query} />
      </FilterField>
      <FilterField id={`${kind}-filter-room`} label="Room">
        <select id={`${kind}-filter-room`} name="room" defaultValue={room}>
          <option value="">{kind === "mismatches" ? "All marked rooms" : "All rooms"}</option>
          {rooms.map((roomCode) => <option key={roomCode} value={roomCode.toLowerCase()}>{roomCode}</option>)}
        </select>
      </FilterField>
      {kind === "attendance" ? (
        <FilterField id="attendance-filter-status" label="Attendance status">
          <select id="attendance-filter-status" name="status" defaultValue={status}>
            <option value="">All statuses</option>
            <option value="standard">Standard present</option>
            <option value="mismatch">Mismatch present</option>
            <option value="commented">Has comment</option>
          </select>
        </FilterField>
      ) : null}
      {kind === "incidents" ? (
        <FilterField id="incidents-filter-type" label="Incident type">
          <select id="incidents-filter-type" name="type" defaultValue={type}>
            <option value="">All incident types</option>
            <option value="wrong_room_redirected">Wrong room redirected</option>
            <option value="duplicate_attempt">Duplicate attempt</option>
            <option value="student_not_found">Student not found</option>
          </select>
        </FilterField>
      ) : null}
      <FilterField id={`${kind}-filter-sort`} label="Sort order">
        <select id={`${kind}-filter-sort`} name="sort" defaultValue={sort}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </FilterField>
      <div className="filter-actions">
        <button className="secondary" type="submit">Apply</button>
        <Link className="button secondary" href={path}>Clear</Link>
      </div>
    </form>
  );
}

function AuditRows({ kind, empty }: { kind: AuditKind; empty: boolean }) {
  if (empty) return null;

  return (
    <>
      {Array.from({ length: 8 }, (_, index) => {
        const studentId = `9000${991 + index}`;
        const longName = index === 0 ? "Long Student Name ".repeat(8) : `Student ${index + 1}`;
        const longEmail = index === 0 ? `${"long.staff.name".repeat(5)}@example.test` : `staff${index}@example.test`;
        const longComment = index === 0 ? "Operational note ".repeat(18) : "-";
        if (kind === "incidents") {
          return (
            <tr key={studentId}>
              <td><span className="pill danger">student not found</span></td>
              <td className="data-mono">{studentId}</td>
              <td><Link href="/sessions/exam-a">Fixture exam A</Link></td>
              <td>R1</td>
              <td>R2</td>
              <td><strong>{longName}</strong><br /><span className="subtle">{longEmail}</span></td>
              <td>{longComment}</td>
              <td className="data-mono">06/09/2026 09:15 AM AEST</td>
            </tr>
          );
        }
        return (
          <tr key={studentId}>
            <td className="data-mono"><Link className="inline-link" href={`/sessions/exam-a?q=${studentId}`}>{studentId}</Link></td>
            <td>{longName}</td>
            <td><Link href="/sessions/exam-a">Fixture exam A</Link></td>
            <td>R1</td>
            <td>R2</td>
            <td><strong>{longName}</strong><br /><span className="subtle">{longEmail}</span></td>
            <td><span className="pill warn">manual | mismatch</span></td>
            <td>{longComment}</td>
            <td className="data-mono">06/09/2026 09:15 AM AEST</td>
          </tr>
        );
      })}
    </>
  );
}

function AuditTable({ kind, empty }: { kind: AuditKind; empty: boolean }) {
  const mismatch = kind === "mismatches";
  const incidents = kind === "incidents";
  return (
    <div className="table-scroll">
      <table className="table compact-table">
        <thead>
          <tr>
            {incidents ? <th>Type</th> : <th>Student ID</th>}
            {incidents ? <th>Student ID</th> : <th>Student Name</th>}
            <th>Exam</th>
            <th>{incidents ? "Room" : "Marked In"}</th>
            <th>Expected Room</th>
            <th>{incidents ? "Raised By" : "Marked By"}</th>
            <th>{incidents ? "Comment" : mismatch ? "Override" : "Source"}</th>
            {!incidents ? <th>Comment</th> : null}
            <th>Timestamp</th>
          </tr>
        </thead>
        <tbody>
          {empty ? (
            <tr><td colSpan={incidents ? 8 : 9} className="subtle">No {kind} match the current filters.</td></tr>
          ) : <AuditRows kind={kind} empty={false} />}
        </tbody>
      </table>
    </div>
  );
}

export function AuditFixture({ kind, searchParams }: { kind: AuditKind; searchParams: SearchParams }) {
  const examSessionId = queryValue(searchParams, "examSessionId", "active");
  const empty = queryValue(searchParams, "q") === "none" || queryValue(searchParams, "room") === "none";
  const path = `/${kind}`;
  const title = kind === "attendance" ? "Attendance Marked" : kind === "incidents" ? "Recorded Incidents" : "Mismatch Present";
  const label = kind === "attendance" ? "Attendance Audit" : kind === "incidents" ? "Incident Log" : "Override Review";
  const total = empty ? 0 : 8;

  return (
    <div className={kind === "incidents" ? "audit-page stack" : "audit-page card wide-card"}>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">Dashboard</Link>
        <span>/</span>
        {kind === "mismatches" ? <Link href={attendanceHref(examSessionId)}>Attendance</Link> : null}
        {kind === "mismatches" ? <span>/</span> : null}
        <span aria-current="page">{kind === "mismatches" ? "Mismatch Present" : kind[0].toUpperCase() + kind.slice(1)}</span>
      </nav>
      {kind === "incidents" ? <div className="card compact-card"><div className="subtle">Matching incidents</div><div className="metric">{total}</div></div> : null}
      <div className="card wide-card">
        {kind === "mismatches" ? (
          <div className="audit-context">
            <span>Attendance audit / mismatch review</span>
            <Link className="inline-link" href={attendanceHref(examSessionId)}>Return to Attendance</Link>
          </div>
        ) : null}
        <div className="audit-header">
          <div>
            <div className="kicker">{label}</div>
            <h1 className="section-title">{title}</h1>
            <div className="subtle">Showing: <strong>{examSessionId === "all" ? "All exams" : examSessionId === "active" ? "Active exams" : "Fixture exam B"}</strong>{kind === "mismatches" ? ` | ${total} record(s)` : ""}</div>
          </div>
          <AuditFilters kind={kind} params={searchParams} />
        </div>
        <AuditTable kind={kind} empty={empty} />
        <nav className="pagination-bar" aria-label={`${kind} pages`}>
          <span className="pagination-summary">{total ? `1-${total} of ${total}` : "0 records"}</span>
          <div className="inline-actions">
            <span className="button secondary disabled" aria-disabled="true">Previous</span>
            <span className="pagination-summary">Page 1 of 2</span>
            <Link className="button secondary" href={pageHref(path, searchParams, 2)}>Next</Link>
          </div>
        </nav>
      </div>
    </div>
  );
}
