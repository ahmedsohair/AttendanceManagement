"use client";

import { useState } from "react";

type CopyButtonProps = {
  className?: string;
  label?: string;
  value: string;
};

export function CopyButton({
  className = "secondary",
  label = "Copy Code",
  value
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function copyValue() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button className={className} type="button" onClick={copyValue}>
      {copied ? "Copied" : label}
    </button>
  );
}
