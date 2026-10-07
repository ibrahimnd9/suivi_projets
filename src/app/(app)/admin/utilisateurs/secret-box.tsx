"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function SecretBox({ secret }: { secret: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3">
      <code className="font-mono text-lg font-semibold tracking-wider text-brand-800">{secret}</code>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={async () => {
          await navigator.clipboard.writeText(secret);
          setCopied(true);
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? "Copié" : "Copier"}
      </button>
    </div>
  );
}
