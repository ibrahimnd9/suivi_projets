import type { ReactNode } from "react";

export type FormState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Mot de passe temporaire à afficher une seule fois */
  secret?: string;
  nonce?: number;
  /// Rapport d'import sérialisé en JSON
  report?: string;
} | undefined;

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-brand-800">{title}</h1>
        {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

const BADGE_TONES = {
  brand: "bg-brand-100 text-brand-800",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-red-50 text-red-700",
  amber: "bg-amber-50 text-amber-800",
  zinc: "bg-zinc-100 text-zinc-600",
} as const;

export function Badge({ tone = "zinc", children }: { tone?: keyof typeof BADGE_TONES; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  );
}

export function ColorDot({ color }: { color?: string | null }) {
  return (
    <span
      className="inline-block size-3 shrink-0 rounded-full border border-black/10"
      style={{ background: color ?? "transparent" }}
    />
  );
}

export function FormMessage({ state }: { state: FormState }) {
  // À défaut de message global, on remonte les erreurs de champ : elles ne sont pas
  // toujours affichées à côté du champ concerné.
  const fieldError = state?.fieldErrors
    ? Object.values(state.fieldErrors)
        .flatMap((messages) => messages ?? [])
        .join(" ")
    : "";
  const error = state?.error ?? (fieldError || undefined);
  if (!error && !state?.success) return null;
  return (
    <div
      role="status"
      className={`rounded-lg px-3 py-2 text-sm ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}
    >
      {error ?? state?.success}
    </div>
  );
}

export function FieldError({ state, name }: { state: FormState; name: string }) {
  const message = state?.fieldErrors?.[name]?.[0];
  return message ? <p className="mt-1 text-xs text-red-600">{message}</p> : null;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-zinc-500">{children}</div>;
}

export function formatDateTime(date: Date | null | undefined) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: process.env.APP_TIMEZONE ?? "Africa/Dakar",
  }).format(date);
}

export function formatDate(date: Date | null | undefined) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeZone: "UTC" }).format(date);
}

const amountFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** Montant en FCFA, ou « — » si absent. */
export function formatAmount(value: { toString(): string } | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${amountFormat.format(Number(value.toString()))} FCFA`;
}

export function ProgressBar({ value, className = "" }: { value: number; className?: string }) {
  const percent = Math.max(0, Math.min(100, value));
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="h-2 w-full min-w-16 overflow-hidden rounded-full bg-zinc-200">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${percent}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-xs font-medium text-zinc-600">{Math.round(percent)} %</span>
    </div>
  );
}

/** Pastille colorée d'un statut ou d'une priorité issue des référentiels. */
export function RefBadge({ item }: { item: { label: string; color: string | null } | null }) {
  if (!item) return <span className="text-zinc-400">—</span>;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ background: `${item.color ?? "#624da0"}1a`, color: item.color ?? "#624da0" }}
    >
      <span className="size-1.5 rounded-full" style={{ background: item.color ?? "#624da0" }} />
      {item.label}
    </span>
  );
}
