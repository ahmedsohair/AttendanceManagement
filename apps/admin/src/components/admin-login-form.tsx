"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSafeNextPath } from "@/lib/safe-next-path";

export function AdminLoginForm({
  initialNextPath,
  unauthorized,
  reset
}: {
  initialNextPath: string;
  unauthorized: boolean;
  reset?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(payload?.message || "Unable to sign in.");
      }

      router.replace(getSafeNextPath(initialNextPath));
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Unable to sign in."
      );
      setBusy(false);
      return;
    }

    setBusy(false);
  }

  return (
    <div className="card account-card account-login-card">
      <div className="kicker">Secure Access</div>
      <h2 className="section-title">Admin Sign In</h2>
      <p className="subtle account-intro">
        Use your administrator credentials to manage exams, invigilators, and
        attendance activity.
      </p>

      <form className="form-grid account-form" onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="admin-login-email">Email address</label>
          <input
            id="admin-login-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            aria-describedby={error ? "admin-login-error" : undefined}
            aria-invalid={Boolean(error)}
          />
        </div>
        <div className="form-field">
          <label htmlFor="admin-login-password">Password</label>
          <input
            id="admin-login-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            aria-describedby={error ? "admin-login-error" : undefined}
            aria-invalid={Boolean(error)}
          />
        </div>
        <button type="submit" disabled={busy}>
          {busy ? "Signing in..." : "Sign In"}
        </button>
      </form>

      {unauthorized ? (
        <p className="account-status account-status-warning">
          This account is not allowed to access the admin dashboard.
        </p>
      ) : null}

      {error ? (
        <p
          id="admin-login-error"
          className="account-status account-status-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {reset === "requested" ? (
        <p className="account-status account-status-success">
          Password reset email sent. Check your inbox for the recovery link.
        </p>
      ) : null}

      {reset === "updated" ? (
        <p className="account-status account-status-success">
          Password updated. Sign in with your new password.
        </p>
      ) : null}

      <div className="inline-actions account-actions account-actions-secondary">
        <Link href="/reset-password" className="subtle">
          Forgot password?
        </Link>
      </div>
    </div>
  );
}
