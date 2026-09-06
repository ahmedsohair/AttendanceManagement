import "../../../apps/admin/app/globals.css";
import { AdminNav } from "../../../apps/admin/src/components/admin-nav";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell admin-shell">
          <div className="header admin-header">
            <div className="admin-topbar">Isolated B4 fixture: synthetic audit data only</div>
          </div>
          <div className="admin-frame">
            <aside className="admin-sidebar" aria-label="Admin navigation">
              <AdminNav />
            </aside>
            <main className="admin-content">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
