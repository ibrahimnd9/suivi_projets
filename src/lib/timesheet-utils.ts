import type { TimesheetStatus } from "@/generated/prisma/enums";

export const TIMESHEET_STATUS_LABELS: Record<TimesheetStatus, string> = {
  BROUILLON: "Brouillon",
  SOUMIS: "Soumise",
  VALIDE: "Validée",
  REJETE: "Rejetée",
};

export const TIMESHEET_STATUS_TONES: Record<TimesheetStatus, "zinc" | "amber" | "green" | "red"> = {
  BROUILLON: "zinc",
  SOUMIS: "amber",
  VALIDE: "green",
  REJETE: "red",
};

/** Lundi (UTC) de la semaine contenant la date donnée. */
export function weekStartOf(date: Date) {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay(); // 0 = dimanche
  utc.setUTCDate(utc.getUTCDate() - (day === 0 ? 6 : day - 1));
  return utc;
}

/** Clé de semaine au format 2026-09-14 (lundi). */
export const weekKey = (weekStart: Date) => weekStart.toISOString().slice(0, 10);

export function parseWeekKey(value: string | undefined, fallback: Date) {
  if (!value) return weekStartOf(fallback);
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? weekStartOf(fallback) : weekStartOf(parsed);
}

export const shiftWeek = (weekStart: Date, weeks: number) =>
  new Date(weekStart.getTime() + weeks * 7 * 86_400_000);

export function formatWeekRange(weekStart: Date) {
  const end = new Date(weekStart.getTime() + 6 * 86_400_000);
  const format = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", timeZone: "UTC" });
  return `${format.format(weekStart)} — ${format.format(end)} ${end.getUTCFullYear()}`;
}

export const DAY_LABELS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

/** Affiche 7.5 comme « 7 h 30 ». */
export function formatHours(value: number) {
  const hours = Math.floor(value);
  const minutes = Math.round((value - hours) * 60);
  if (!minutes) return `${hours} h`;
  return `${hours} h ${String(minutes).padStart(2, "0")}`;
}
