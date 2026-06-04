"use client";

import { useState } from "react";

type CopyButtonProps = {
  label?: string;
  value: string;
};

export function CopyButton({ label = "Copy Code", value }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function copyValue() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button className="secondary" type="button" onClick={copyValue}>
      {copied ? "Copied" : label}
    </button>
  );
}
