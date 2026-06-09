import type { Metadata } from "next";
import Link from "next/link";
import { getOptionalSessionUser } from "@/lib/auth";
import { AdminNav } from "@/components/admin-nav";
import { ExamPulseLogo } from "@/components/exam-pulse-logo";
import { SignOutButton } from "@/components/sign-out-button";
import "./globals.css";

export const metadata: Metadata = {
  title: "ExamPulse",
  description: "Attendance made smart"
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const sessionUser = await getOptionalSessionUser();
  const isAdmin = sessionUser?.role === "admin";

  return (
    <html lang="en">
      <body>
        <div className={isAdmin ? "shell admin-shell" : "shell"}>
          <div className={isAdmin ? "header admin-header" : "header"}>
            {isAdmin ? (
              <div className="admin-topbar">
                <div className="admin-user">
                  <span>{sessionUser.fullName}</span>
                  <SignOutButton />
                </div>
              </div>
            ) : (
              <div className="brand-logo-wrap">
                <ExamPulseLogo />
              </div>
            )}
          </div>
          {isAdmin ? (
            <div className="admin-frame">
              <aside className="admin-sidebar" aria-label="Admin navigation">
                <div className="admin-sidebar-brand">
                  <ExamPulseLogo />
                  <span>Admin Portal</span>
                </div>
                <AdminNav />
                <Link className="button sidebar-primary" href="/sessions/new">
                  Add New Exam
                </Link>
              </aside>
              <main className="admin-content">{children}</main>
            </div>
          ) : (
            children
          )}
        </div>
      </body>
    </html>
  );
}
