import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { Profile, TimesheetStatus } from "@/generated/prisma/enums";

export { TIMESHEET_STATUS_LABELS, weekKey, weekStartOf, parseWeekKey } from "@/lib/timesheet-utils";

export const MAX_HOURS_PER_DAY = 24;
export const MIN_HOURS_PER_ENTRY = 0.25;

export const timesheetInclude = {
  user: { include: { manager: true } },
  reviewer: true,
  entries: {
    include: { project: true, workItem: true, activityType: true },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  },
} satisfies Prisma.TimesheetInclude;

export type TimesheetDetail = Prisma.TimesheetGetPayload<{ include: typeof timesheetInclude }>;

/** Récupère la fiche de la semaine, en la créant si besoin. */
export async function getOrCreateTimesheet(userId: string, weekStart: Date) {
  const existing = await db.timesheet.findUnique({
    where: { userId_weekStart: { userId, weekStart } },
    include: timesheetInclude,
  });
  if (existing) return existing;
  await db.timesheet.create({ data: { userId, weekStart } });
  return db.timesheet.findUniqueOrThrow({
    where: { userId_weekStart: { userId, weekStart } },
    include: timesheetInclude,
  });
}

/** Une fiche n'est modifiable qu'en brouillon ou après rejet. */
export function isEditable(status: TimesheetStatus) {
  return status === "BROUILLON" || status === "REJETE";
}

/** Peut valider : le supérieur hiérarchique (N+1) de la personne, ou un administrateur. */
export function canReview(
  reviewer: { id: string; profile: Profile },
  sheetUser: { id: string; managerId: string | null },
) {
  if (reviewer.id === sheetUser.id) return false;
  return sheetUser.managerId === reviewer.id || reviewer.profile === "ADMIN";
}

export const days = (weekStart: Date) =>
  Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 86_400_000));

const toNumber = (value: { toString(): string } | null | undefined) => (value ? Number(value.toString()) : 0);

export function totalHours(entries: { hours: { toString(): string } }[]) {
  return entries.reduce((sum, entry) => sum + toNumber(entry.hours), 0);
}

/** Totaux par jour de la semaine. */
export function hoursByDay(entries: { date: Date; hours: { toString(): string } }[], weekStart: Date) {
  return days(weekStart).map((day) => ({
    day,
    hours: entries
      .filter((entry) => entry.date.toISOString().slice(0, 10) === day.toISOString().slice(0, 10))
      .reduce((sum, entry) => sum + toNumber(entry.hours), 0),
  }));
}

/** Regroupe des heures par clé, triées par volume décroissant. */
export function groupHours<T>(items: T[], key: (item: T) => string, hours: (item: T) => number) {
  const totals = new Map<string, number>();
  for (const item of items) totals.set(key(item), (totals.get(key(item)) ?? 0) + hours(item));
  return [...totals.entries()].map(([label, value]) => ({ label, hours: value })).sort((a, b) => b.hours - a.hours);
}

/** Semaines précédentes de l'utilisateur, avec leur total. */
export async function recentTimesheets(userId: string, limit = 8) {
  const sheets = await db.timesheet.findMany({
    where: { userId },
    orderBy: { weekStart: "desc" },
    take: limit,
    include: { entries: { select: { hours: true } } },
  });
  return sheets.map((sheet) => ({ ...sheet, total: totalHours(sheet.entries) }));
}

/** Consommé par projet sur une période, pour les tableaux de consolidation. */
export async function consumedByProject(where: Prisma.TimeEntryWhereInput) {
  const entries = await db.timeEntry.findMany({
    where: { ...where, projectId: { not: null } },
    include: { project: { select: { id: true, code: true, name: true } } },
  });
  const totals = new Map<string, { code: string; name: string; hours: number }>();
  for (const entry of entries) {
    if (!entry.project) continue;
    const current = totals.get(entry.project.id) ?? { code: entry.project.code, name: entry.project.name, hours: 0 };
    current.hours += toNumber(entry.hours);
    totals.set(entry.project.id, current);
  }
  return [...totals.entries()]
    .map(([id, value]) => ({ id, ...value }))
    .sort((a, b) => b.hours - a.hours);
}

/** Charge d'un projet : temps prévu (équipe et planning) comparé au temps consommé. */
export async function projectWorkload(projectId: string) {
  const [members, workItems, entries] = await Promise.all([
    db.projectMember.findMany({ where: { projectId }, include: { user: true } }),
    db.workItem.findMany({ where: { projectId }, select: { plannedHours: true } }),
    db.timeEntry.findMany({ where: { projectId }, include: { user: true, activityType: true, timesheet: true } }),
  ]);

  const plannedFromTeam = members.reduce((sum, m) => sum + toNumber(m.plannedHours), 0);
  const plannedFromPlanning = workItems.reduce((sum, w) => sum + toNumber(w.plannedHours), 0);
  const planned = Math.max(plannedFromTeam, plannedFromPlanning);
  const consumed = totalHours(entries);
  const validated = totalHours(entries.filter((e) => e.timesheet.status === "VALIDE"));

  const byPerson = members.map((member) => {
    const personal = entries.filter((e) => e.userId === member.userId);
    return {
      userId: member.userId,
      name: `${member.user.firstName} ${member.user.lastName}`,
      planned: toNumber(member.plannedHours),
      consumed: totalHours(personal),
    };
  });
  // Personnes ayant saisi du temps sans être membres de l'équipe
  for (const entry of entries) {
    if (byPerson.some((p) => p.userId === entry.userId)) continue;
    byPerson.push({
      userId: entry.userId,
      name: `${entry.user.firstName} ${entry.user.lastName}`,
      planned: 0,
      consumed: totalHours(entries.filter((e) => e.userId === entry.userId)),
    });
  }

  return {
    planned,
    plannedFromTeam,
    plannedFromPlanning,
    consumed,
    validated,
    byPerson: byPerson.sort((a, b) => b.consumed - a.consumed),
    byActivity: groupHours(entries, (e) => e.activityType.label, (e) => toNumber(e.hours)),
  };
}

/**
 * Signale une dérive : le temps consommé dépasse nettement l'avancement.
 * Exemple du cahier des charges : 75 % du temps prévu consommé pour 50 % d'avancement.
 */
export function driftAlert(planned: number, consumed: number, progress: number) {
  if (planned <= 0) return null;
  const consumptionRate = (consumed / planned) * 100;
  if (consumptionRate - progress < 15) return null;
  return {
    consumptionRate,
    message: `${Math.round(consumptionRate)} % du temps prévu est consommé pour ${Math.round(progress)} % d’avancement.`,
  };
}
