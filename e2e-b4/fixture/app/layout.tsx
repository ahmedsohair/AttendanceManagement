import "../../../apps/admin/app/globals.css";
import Link from "next/link";
import { AdminNav } from "../../../apps/admin/src/components/admin-nav";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell admin-shell">
          <div className="header admin-header">
            <div className="admin-topbar">
              <div className="admin-user">
                <span>Isolated B4 fixture: synthetic audit data only</span>
              </div>
            </div>
          </div>
          <div className="admin-frame">
            <aside className="admin-sidebar" aria-label="Admin navigation">
              <AdminNav />
              <Link className="button sidebar-primary" href="/sessions/new">
                Add New Exam
              </Link>
            </aside>
            <main className="admin-content">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
