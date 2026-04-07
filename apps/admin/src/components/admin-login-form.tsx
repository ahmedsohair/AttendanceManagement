"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

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
      const supabase = getSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password
      });

      if (signInError) {
        throw signInError;
      }

      router.replace(initialNextPath);
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
    <div className="card" style={{ maxWidth: 520, margin: "0 auto" }}>
      <div className="kicker">Secure Access</div>
      <h2 className="section-title">Admin Sign In</h2>
      <p className="subtle" style={{ marginTop: 0 }}>
        Use your administrator credentials to manage exams, invigilators, and
        attendance activity.
      </p>

      <form className="form-grid" onSubmit={handleSubmit}>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email address"
          autoComplete="email"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          required
        />
        <button type="submit" disabled={busy}>
          {busy ? "Signing in..." : "Sign In"}
        </button>
      </form>

      {unauthorized ? (
        <p className="subtle" style={{ color: "var(--warn)", marginBottom: 0 }}>
          This account is not allowed to access the admin dashboard.
        </p>
      ) : null}

      {error ? (
        <p className="subtle" style={{ color: "var(--accent-dark)", marginBottom: 0 }}>
          {error}
        </p>
      ) : null}

      {reset === "requested" ? (
        <p className="subtle" style={{ color: "var(--ok)", marginBottom: 0 }}>
          Password reset email sent. Check your inbox for the recovery link.
        </p>
      ) : null}

      {reset === "updated" ? (
        <p className="subtle" style={{ color: "var(--ok)", marginBottom: 0 }}>
          Password updated. Sign in with your new password.
        </p>
      ) : null}

      <div className="inline-actions" style={{ marginTop: 12 }}>
        <Link href="/reset-password" className="subtle" style={{ color: "var(--accent-dark)" }}>
          Forgot password?
        </Link>
      </div>
    </div>
  );
}
