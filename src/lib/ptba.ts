import "server-only";
import { db } from "@/lib/db";
import { PTBA_CLOSED_STATUSES } from "@/lib/strategy-labels";
import type { Prisma } from "@/generated/prisma/client";
import type { PtbaActivityStatus } from "@/generated/prisma/enums";

export { STRATEGIC_STATUS_LABELS, PTBA_ACTIVITY_STATUS_LABELS, PTBA_YEAR_STATUS_LABELS } from "@/lib/strategy-labels";

const num = (value: { toString(): string } | null | undefined) =>
  value === null || value === undefined ? 0 : Number(value.toString());

export const activityInclude = {
  year: true,
  owner: true,
  direction: true,
  priority: true,
  result: { include: { objective: { include: { axis: true } } } },
  participants: { include: { user: true } },
  projectLinks: { include: { project: { include: { status: true } } } },
} satisfies Prisma.PtbaActivityInclude;

export type ActivityRow = Prisma.PtbaActivityGetPayload<{ include: typeof activityInclude }>;

/** Budget prévu d'une activité : somme des quatre natures. */
export function plannedBudget(activity: {
  budgetHr: { toString(): string };
  budgetServices: { toString(): string };
  budgetInvestment: { toString(): string };
  budgetOperating: { toString(): string };
}) {
  return num(activity.budgetHr) + num(activity.budgetServices) + num(activity.budgetInvestment) + num(activity.budgetOperating);
}

export type ActivityBudget = {
  planned: number;
  committed: number;
  paid: number;
  balance: number;
  executionRate: number;
  variance: number;
};

/** Exécution budgétaire d'une activité PTBA. */
export function activityBudget(activity: Parameters<typeof plannedBudget>[0] & {
  committed: { toString(): string };
  paid: { toString(): string };
}): ActivityBudget {
  const planned = plannedBudget(activity);
  const committed = num(activity.committed);
  const paid = num(activity.paid);
  return {
    planned,
    committed,
    paid,
    balance: planned - committed - paid,
    executionRate: planned > 0 ? (paid / planned) * 100 : 0,
    variance: planned - paid,
  };
}

/**
 * Avancement d'une activité : moyenne des projets liés pondérée par leur contribution.
 * Une valeur saisie manuellement prime sur le calcul.
 */
export function computeActivityProgress(activity: {
  progressManual: { toString(): string } | null;
  projectLinks: { contribution: { toString(): string }; project: { progress: { toString(): string } } }[];
}): { value: number; source: "manuel" | "projets" | "aucun" } {
  if (activity.progressManual !== null) return { value: num(activity.progressManual), source: "manuel" };
  if (activity.projectLinks.length === 0) return { value: 0, source: "aucun" };

  const weight = activity.projectLinks.reduce((sum, link) => sum + num(link.contribution), 0);
  if (weight === 0) return { value: 0, source: "projets" };
  const total = activity.projectLinks.reduce(
    (sum, link) => sum + num(link.project.progress) * num(link.contribution),
    0,
  );
  return { value: total / weight, source: "projets" };
}

/** Dépenses des projets liés, retenues au prorata de leur contribution. */
export async function linkedProjectSpending(activityId: string) {
  const links = await db.ptbaProjectLink.findMany({
    where: { activityId },
    include: { project: { include: { budgetLines: true } } },
  });
  return links.reduce((sum, link) => {
    const spent = link.project.budgetLines.reduce((total, line) => total + num(line.spent), 0);
    return sum + (spent * num(link.contribution)) / 100;
  }, 0);
}

export const isActivityClosed = (status: PtbaActivityStatus) => PTBA_CLOSED_STATUSES.includes(status);

/** Une activité est en retard si sa date de fin est dépassée sans être soldée. */
export function isActivityLate(
  activity: { endDate: Date | null; status: PtbaActivityStatus },
  now = new Date(),
) {
  return !!activity.endDate && activity.endDate < now && !isActivityClosed(activity.status);
}

/** Recalcule et enregistre l'avancement d'une activité à partir des projets liés. */
export async function refreshActivityProgress(activityId: string) {
  const activity = await db.ptbaActivity.findUnique({
    where: { id: activityId },
    include: { projectLinks: { include: { project: { select: { progress: true } } } } },
  });
  if (!activity) return;
  const { value } = computeActivityProgress(activity);
  await db.ptbaActivity.update({
    where: { id: activityId },
    data: { progress: Math.round(value * 100) / 100 },
  });
}

/** Recalcule toutes les activités liées à un projet (après évolution de son avancement). */
export async function refreshActivitiesOfProject(projectId: string) {
  const links = await db.ptbaProjectLink.findMany({ where: { projectId }, select: { activityId: true } });
  for (const link of links) await refreshActivityProgress(link.activityId);
}

export type PtbaTotals = {
  count: number;
  done: number;
  late: number;
  suspended: number;
  executionRate: number;
  budgetPlanned: number;
  budgetPaid: number;
  budgetCommitted: number;
  budgetRate: number;
};

/** Indicateurs consolidés d'un ensemble d'activités. */
export function ptbaTotals(activities: ActivityRow[], now = new Date()): PtbaTotals {
  const count = activities.length;
  const done = activities.filter((a) => a.status === "TERMINEE").length;
  const late = activities.filter((a) => isActivityLate(a, now) || a.status === "EN_RETARD").length;
  const suspended = activities.filter((a) => a.status === "SUSPENDUE").length;
  const progressSum = activities.reduce((sum, a) => sum + computeActivityProgress(a).value, 0);
  const budgets = activities.map(activityBudget);
  const budgetPlanned = budgets.reduce((sum, b) => sum + b.planned, 0);
  const budgetPaid = budgets.reduce((sum, b) => sum + b.paid, 0);
  const budgetCommitted = budgets.reduce((sum, b) => sum + b.committed, 0);

  return {
    count,
    done,
    late,
    suspended,
    executionRate: count > 0 ? progressSum / count : 0,
    budgetPlanned,
    budgetPaid,
    budgetCommitted,
    budgetRate: budgetPlanned > 0 ? (budgetPaid / budgetPlanned) * 100 : 0,
  };
}

/** Exercice PTBA à afficher par défaut : celui en exécution, sinon le plus récent. */
export async function defaultPtbaYear() {
  return (
    (await db.ptbaYear.findFirst({ where: { status: "EN_EXECUTION" }, orderBy: { year: "desc" } })) ??
    (await db.ptbaYear.findFirst({ orderBy: { year: "desc" } }))
  );
}
