"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function SubmitButton({
  children,
  pendingLabel = "Enregistrement…",
  className = "btn btn-primary",
  confirm,
  pending: pendingProp = false,
}: {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
  /** Message de confirmation affiché avant l'envoi */
  confirm?: string;
  /** État d'envoi fourni par useFormAction */
  pending?: boolean;
}) {
  const status = useFormStatus();
  const pending = pendingProp || status.pending;
  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
