import type { KpiDirection, KpiFrequency, RiskStatus } from "@/generated/prisma/enums";

export const KPI_FREQUENCY_LABELS: Record<KpiFrequency, string> = {
  MENSUELLE: "Mensuelle",
  TRIMESTRIELLE: "Trimestrielle",
  SEMESTRIELLE: "Semestrielle",
  ANNUELLE: "Annuelle",
  PONCTUELLE: "Ponctuelle",
};

export const KPI_DIRECTION_LABELS: Record<KpiDirection, string> = {
  HAUSSE: "À la hausse (plus c’est élevé, mieux c’est)",
  BAISSE: "À la baisse (plus c’est bas, mieux c’est)",
};

export const RISK_STATUS_LABELS: Record<RiskStatus, string> = {
  IDENTIFIE: "Identifié",
  EN_TRAITEMENT: "En traitement",
  MAITRISE: "Maîtrisé",
  AVERE: "Avéré",
  CLOS: "Clos",
};

export const RISK_KIND_LABELS = { RISQUE: "Risque", PROBLEME: "Problème" } as const;

const num = (value: { toString(): string } | null | undefined) =>
  value === null || value === undefined ? null : Number(value.toString());

/**
 * Taux de réalisation d'un KPI.
 * Avec une valeur de référence : (actuelle − référence) / (cible − référence) × 100.
 * Sans référence : actuelle / cible × 100 (à la hausse) ou cible / actuelle × 100 (à la baisse).
 */
export function kpiAchievement(kpi: {
  baseline: { toString(): string } | null;
  target: { toString(): string } | null;
  direction: KpiDirection;
}, current: { toString(): string } | null | undefined): number | null {
  const target = num(kpi.target);
  const baseline = num(kpi.baseline);
  const value = num(current);
  if (value === null || target === null) return null;

  if (baseline !== null && baseline !== target) {
    return ((value - baseline) / (target - baseline)) * 100;
  }
  if (kpi.direction === "BAISSE") {
    if (value === 0) return target === 0 ? 100 : null;
    return (target / value) * 100;
  }
  if (target === 0) return value === 0 ? 100 : null;
  return (value / target) * 100;
}

export type KpiState = { label: string; tone: "green" | "amber" | "red" | "zinc" };

/** Compare le taux de réalisation aux seuils du KPI. */
export function kpiState(
  achievement: number | null,
  thresholds: { alertThreshold: { toString(): string }; okThreshold: { toString(): string } },
): KpiState {
  if (achievement === null) return { label: "Non renseigné", tone: "zinc" };
  const ok = Number(thresholds.okThreshold.toString());
  const alert = Number(thresholds.alertThreshold.toString());
  if (achievement >= ok) return { label: "Atteint", tone: "green" };
  if (achievement >= alert) return { label: "En alerte", tone: "amber" };
  return { label: "Non atteint", tone: "red" };
}

export const RISK_LEVELS = [
  { max: 6, label: "Faible", tone: "green" as const, color: "#10b981" },
  { max: 12, label: "Moyen", tone: "amber" as const, color: "#f59e0b" },
  { max: 25, label: "Critique", tone: "red" as const, color: "#ef4444" },
];

/** Criticité = probabilité × impact (échelles de 1 à 5). */
export function riskLevel(probability: number, impact: number) {
  const score = probability * impact;
  const level = RISK_LEVELS.find((l) => score <= l.max) ?? RISK_LEVELS[RISK_LEVELS.length - 1];
  return { score, ...level };
}

export const isRiskOpen = (status: RiskStatus) => status !== "CLOS" && status !== "MAITRISE";

/** Une diligence est en retard si l'échéance est passée et qu'elle n'est ni réalisée ni annulée. */
export function isDiligenceLate(
  diligence: { dueDate: Date | null; status: { meta: unknown } },
  now = new Date(),
) {
  const meta = diligence.status.meta as { done?: boolean } | null;
  return !!diligence.dueDate && diligence.dueDate < now && meta?.done !== true;
}

export type BudgetTotals = {
  initial: number;
  revised: number;
  committed: number;
  spent: number;
  available: number;
  consumptionRate: number;
  variance: number;
};

/** Consolidation budgétaire d'un projet. */
export function budgetTotals(
  lines: { initial: { toString(): string }; revised: { toString(): string } | null; committed: { toString(): string }; spent: { toString(): string } }[],
): BudgetTotals {
  const initial = lines.reduce((sum, l) => sum + Number(l.initial.toString()), 0);
  const revised = lines.reduce((sum, l) => sum + (num(l.revised) ?? Number(l.initial.toString())), 0);
  const committed = lines.reduce((sum, l) => sum + Number(l.committed.toString()), 0);
  const spent = lines.reduce((sum, l) => sum + Number(l.spent.toString()), 0);
  const reference = revised || initial;
  return {
    initial,
    revised,
    committed,
    spent,
    available: reference - committed - spent,
    consumptionRate: reference > 0 ? (spent / reference) * 100 : 0,
    variance: reference - spent,
  };
}
