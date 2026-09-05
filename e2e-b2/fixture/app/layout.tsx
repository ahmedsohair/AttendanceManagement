import "../../../apps/admin/app/globals.css";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>
    <div className="shell admin-shell">
      <div className="header admin-header"><div className="admin-topbar">Isolated B2 fixture: no backend routes</div></div>
      <div className="admin-frame">
        <aside className="admin-sidebar">Admin fixture navigation</aside>
        <main className="admin-content"><div className="stack">{children}</div></main>
      </div>
    </div>
  </body></html>;
}
