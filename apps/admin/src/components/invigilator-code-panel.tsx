"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@algo-attendance/shared";
import { KeyIcon } from "@/components/action-icons";
import { CopyButton } from "@/components/copy-button";

type InvigilatorCodePanelProps = {
  initialAccessCode?: string;
  invigilator: User;
};

async function readJsonResponse(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as {
    accessCode?: string;
    message?: string;
    status?: "pending" | "active";
  };

  if (!response.ok) {
    throw new Error(payload.message || "Request failed.");
  }

  return payload;
}

export function InvigilatorCodePanel({
  initialAccessCode,
  invigilator
}: InvigilatorCodePanelProps) {
  const [accessCode, setAccessCode] = useState(initialAccessCode || "");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [isEmailing, setIsEmailing] = useState(false);
  const [codeStatus, setCodeStatus] = useState<"pending" | "active">(
    initialAccessCode ? "active" : "pending"
  );
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!panelRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  async function generateCode() {
    setIsGenerating(true);
    setNotice("");
    setError("");

    try {
      const payload = await readJsonResponse(
        await fetch(`/api/invigilators/${invigilator.id}/access-code`, {
          method: "POST"
        })
      );

      setAccessCode(payload.accessCode || "");
      setCodeStatus("pending");
      setNotice(payload.message || "New access code generated.");
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "Unable to generate access code."
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function activateCode() {
    if (!accessCode) {
      setError("Generate a code before activating it.");
      return;
    }
    if (
      !window.confirm(
        "Activate this new code? The previous code will stop working for new sign-ins. Existing signed-in scanner sessions will remain active."
      )
    ) {
      return;
    }

    setIsActivating(true);
    setNotice("");
    setError("");

    try {
      const payload = await readJsonResponse(
        await fetch(`/api/invigilators/${invigilator.id}/access-code`, {
          body: JSON.stringify({ accessCode }),
          headers: { "Content-Type": "application/json" },
          method: "PUT"
        })
      );
      setCodeStatus("active");
      setNotice(payload.message || "New access code activated.");
    } catch (activationError) {
      setError(
        activationError instanceof Error
          ? activationError.message
          : "Unable to activate access code."
      );
    } finally {
      setIsActivating(false);
    }
  }

  async function emailCode() {
    if (!accessCode) {
      setError("Generate a code before emailing.");
      return;
    }
    if (codeStatus !== "active") {
      setError("Activate this code before emailing it.");
      return;
    }

    setIsEmailing(true);
    setNotice("");
    setError("");

    try {
      const payload = await readJsonResponse(
        await fetch("/api/invigilators/email-code", {
          body: JSON.stringify({
            accessCode,
            email: invigilator.email,
            fullName: invigilator.fullName,
            userId: invigilator.id
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        })
      );

      setNotice(payload.message || "Access code emailed.");
      window.setTimeout(() => setIsOpen(false), 800);
    } catch (emailError) {
      setError(emailError instanceof Error ? emailError.message : "Unable to email code.");
    } finally {
      setIsEmailing(false);
    }
  }

  return (
    <details className="inline-details" open={isOpen} ref={panelRef}>
      <summary
        className="icon-button"
        onClick={(event) => {
          event.preventDefault();
          setIsOpen((current) => !current);
        }}
        title="Access code"
      >
        <KeyIcon />
        <span className="sr-only">Access code</span>
      </summary>
      <div className="inline-popover">
        {accessCode ? (
          <div className="access-code-box compact-code-box">
            <div>
              <div className="kicker">
                {codeStatus === "active" ? "Active New Code" : "Pending New Code"}
              </div>
              <div className="access-code-value">{accessCode}</div>
            </div>
            <div className="subtle">
              {codeStatus === "active"
                ? "This code is active. Existing signed-in scanner sessions remain active."
                : "The current code still works. Activate this code only when you are ready to replace it."}
            </div>
            <div className="inline-actions">
              <CopyButton
                className="secondary compact-button"
                label="Copy"
                value={accessCode}
              />
              {codeStatus === "pending" ? (
                <button type="button" onClick={activateCode} disabled={isActivating}>
                  {isActivating ? "Activating..." : "Activate Code"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={emailCode}
                disabled={isEmailing || codeStatus !== "active"}
              >
                {isEmailing ? "Emailing..." : "Email Code"}
              </button>
            </div>
          </div>
        ) : (
          <div className="subtle">
            Existing access codes are stored securely and cannot be viewed. Generate a
            new code if this invigilator needs access.
          </div>
        )}
        <button type="button" onClick={generateCode} disabled={isGenerating}>
          {isGenerating ? "Generating..." : "Generate New Code"}
        </button>
        {notice ? <p className="pill ok toast-message">{notice}</p> : null}
        {error ? <p className="pill warn toast-message">{error}</p> : null}
      </div>
    </details>
  );
}
