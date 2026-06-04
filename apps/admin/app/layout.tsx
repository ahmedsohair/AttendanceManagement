import type { Metadata } from "next";
import Link from "next/link";
import { getOptionalSessionUser } from "@/lib/auth";
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

  return (
    <html lang="en">
      <body>
        <div className="shell">
          <div className="header">
            <div className="brand-logo-wrap">
              <ExamPulseLogo />
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
