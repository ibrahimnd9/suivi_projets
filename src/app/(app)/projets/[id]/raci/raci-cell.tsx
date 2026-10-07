"use client";

import { useState, useTransition } from "react";

const ROLES = ["", "R", "A", "C", "I"] as const;

/** Sélecteur compact d'un rôle RACI, enregistré dès le choix. */
export function RaciCell({
  action,
  value,
  label,
}: {
  action: (role: string) => Promise<void>;
  value: string;
  label: string;
}) {
  const [current, setCurrent] = useState(value);
  const [pending, startTransition] = useTransition();

  return (
    <select
      aria-label={label}
      value={current}
      disabled={pending}
      onChange={(event) => {
        const role = event.target.value;
        setCurrent(role);
        startTransition(() => action(role));
      }}
      className={`w-14 rounded border px-1 py-0.5 text-center text-sm font-semibold ${
        current ? "border-brand-300 bg-brand-50 text-brand-800" : "border-zinc-200 text-zinc-400"
      }`}
    >
      {ROLES.map((role) => (
        <option key={role} value={role}>{role || "—"}</option>
      ))}
    </select>
  );
}
