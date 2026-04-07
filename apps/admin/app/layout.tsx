import type { Metadata } from "next";
import Link from "next/link";
import { getOptionalSessionUser } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";
import "./globals.css";

export const metadata: Metadata = {
  title: "Attendance Management System",
  description: "Attendance made easy!"
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const sessionUser = await getOptionalSessionUser();

  return (
    <html lang="en">
      <body>
        <div className="shell">
          <div className="header">
            <div>
              <div className="brand">Attendance Management System</div>
              <div className="subtle">Attendance made easy!</div>
            </div>
            {sessionUser?.role === "admin" ? (
              <div className="actions">
                <div className="subtle" style={{ alignSelf: "center", fontWeight: 600 }}>
                  {sessionUser.fullName}
                </div>
                <Link className="button secondary" href="/">
                  Dashboard
                </Link>
                <Link className="button secondary" href="/invigilators">
                  Invigilators
                </Link>
                <Link className="button" href="/sessions/new">
                  Add New Exam
                </Link>
                <SignOutButton />
              </div>
            ) : null}
          </div>
          {children}
        </div>
      </body>
    </html>
  );
}
