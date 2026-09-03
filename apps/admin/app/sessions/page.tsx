import Link from "next/link";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CloseIcon, DownloadIcon, TrashIcon } from "@/components/action-icons";
import {
  getExamSessionPage,
  type ExamSessionListSort,
  type ExamSessionPage
} from "@/lib/admin-queries";
import { requireAdminPageUser } from "@/lib/auth";
import { logServerTiming } from "@/lib/timing";

export const dynamic = "force-dynamic";

type SessionsSearchParams = {
  q?: string;
  sort?: string;
  activePage?: string;
  draftPage?: string;
  closedPage?: string;
};

type PageKey = "activePage" | "draftPage" | "closedPage";

function normalizePage(value?: string) {
  const page = Number.parseInt(value || "1", 10);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function pageHref(params: SessionsSearchParams, pageKey: PageKey, page: number) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key !== pageKey && value) query.set(key, value);
  }
  if (page > 1) query.set(pageKey, String(page));
  const serialized = query.toString();
  return serialized ? `/sessions?${serialized}` : "/sessions";
}

function SectionPagination({
  data,
  label,
  pageKey,
  params
}: {
  data: ExamSessionPage;
  label: string;
  pageKey: PageKey;
  params: SessionsSearchParams;
}) {
  const firstRow = data.totalCount ? (data.page - 1) * data.pageSize + 1 : 0;
  const lastRow = Math.min(data.page * data.pageSize, data.totalCount);

  return (
    <nav className="pagination-bar" aria-label={`${label} pages`}>
      <span className="pagination-summary">
        {data.totalCount ? `${firstRow}-${lastRow} of ${data.totalCount}` : "0 exams"}
      </span>
      <div className="inline-actions">
        {data.page > 1 ? (
          <Link className="button secondary" href={pageHref(params, pageKey, data.page - 1)}>
            Previous
          </Link>
        ) : (
          <span className="button secondary disabled" aria-disabled="true">Previous</span>
        )}
        <span className="pagination-summary">Page {data.page} of {data.totalPages}</span>
        {data.page < data.totalPages ? (
          <Link className="button secondary" href={pageHref(params, pageKey, data.page + 1)}>
            Next
          </Link>
        ) : (
          <span className="button secondary disabled" aria-disabled="true">Next</span>
        )}
      </div>
    </nav>
  );
}

export default async function SessionsPage({
  searchParams
}: {
  searchParams?: Promise<SessionsSearchParams>;
}) {
  const startedAt = performance.now();
  await requireAdminPageUser();
  const params = (await searchParams) || {};
  const query = (params.q || "").trim();
  const sort: ExamSessionListSort = params.sort === "oldest" ? "oldest" : "newest";
  const [active, drafts, closed] = await Promise.all([
    getExamSessionPage({ status: "active", query, sort, page: normalizePage(params.activePage) }),
    getExamSessionPage({ status: "draft", query, sort, page: normalizePage(params.draftPage) }),
    getExamSessionPage({ status: "closed", query, sort, page: normalizePage(params.closedPage) })
  ]);
  logServerTiming("page.sessions", startedAt, {
    activeSessions: active.rows.length,
    draftSessions: drafts.rows.length,
    closedSessions: closed.rows.length
  });

  return (
    <div className="stack">
      <div className="card">
        <div className="inline-actions" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="kicker">Exam Management</div>
            <h2 className="section-title">Exam Sessions</h2>
          </div>
          <div className="inline-actions">
            <form className="search-form table-filter-form" action="/sessions" method="get">
              <input name="q" placeholder="Search exam/date/venue" defaultValue={query} />
              <select name="sort" defaultValue={sort}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
              <button className="secondary" type="submit">Apply</button>
              <Link className="button secondary" href="/sessions">Clear</Link>
            </form>
            <Link className="button" href="/sessions/new">Add New Exam</Link>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="kicker">Active</div>
        <h2 className="section-title">Live Exam Sessions ({active.totalCount})</h2>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Date</th>
                <th>Time</th>
                <th>Rooms</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {active.rows.length ? (
                active.rows.map((session) => (
                  <tr key={session.id}>
                    <td><Link href={`/sessions/${session.id}`}>{session.name}</Link></td>
                    <td>{session.examDate}</td>
                    <td>{session.startTime}</td>
                    <td>{session.roomCount}</td>
                    <td>
                      <form action={`/api/exam-sessions/${session.id}/close`} method="post">
                        <ConfirmSubmitButton
                          className="button secondary"
                          message={`Close ${session.name}? Invigilators will no longer see it as active.`}
                        >
                          <CloseIcon />
                          <span>Close Exam</span>
                        </ConfirmSubmitButton>
                      </form>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={5} className="subtle">No active exams match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <SectionPagination data={active} label="Active exams" pageKey="activePage" params={params} />
      </div>

      <div className="layout-two">
        <div className="card tint">
          <div className="kicker">Drafts</div>
          <h2 className="section-title">Waiting To Publish ({drafts.totalCount})</h2>
          <div className="stack">
            {drafts.rows.length ? (
              drafts.rows.map((session) => (
                <div key={session.id} className="card" style={{ padding: 16 }}>
                  <div className="detail-row-main">
                    <div>
                      <Link className="inline-link" href={`/sessions/${session.id}`}>{session.name}</Link>
                      <div className="subtle">
                        {session.examDate} | {session.startTime} | {session.roomCount} room(s)
                      </div>
                    </div>
                    <div className="inline-actions">
                      <Link className="button secondary" href={`/sessions/${session.id}`}>Review & Publish</Link>
                      <form action={`/api/exam-sessions/${session.id}/delete`} method="post">
                        <ConfirmSubmitButton
                          className="button danger"
                          confirmationText={session.name}
                          message={`Delete draft ${session.name}? This cannot be undone.`}
                        >
                          <TrashIcon />
                          <span>Delete Draft</span>
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="subtle">No draft exams match.</div>
            )}
          </div>
          <SectionPagination data={drafts} label="Draft exams" pageKey="draftPage" params={params} />
        </div>

        <div className="card">
          <div className="kicker">Closed</div>
          <h2 className="section-title">Exam History ({closed.totalCount})</h2>
          <div className="stack">
            {closed.rows.length ? (
              closed.rows.map((session) => (
                <div key={session.id} className="card" style={{ padding: 16 }}>
                  <div className="detail-row-main">
                    <div>
                      <Link className="inline-link" href={`/sessions/${session.id}`}>{session.name}</Link>
                      <div className="subtle">
                        {session.examDate} | {session.startTime} | {session.roomCount} room(s)
                      </div>
                    </div>
                    <a
                      className="button secondary"
                      href={`/api/reports/${session.id}/export`}
                      title="Export XLSX"
                    >
                      <DownloadIcon />
                      <span>Export XLSX</span>
                    </a>
                  </div>
                </div>
              ))
            ) : (
              <div className="subtle">No closed exams match.</div>
            )}
          </div>
          <SectionPagination data={closed} label="Closed exams" pageKey="closedPage" params={params} />
        </div>
      </div>
    </div>
  );
}
