"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, displayName } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import {
  canReview,
  getOrCreateTimesheet,
  isEditable,
  MAX_HOURS_PER_DAY,
  MIN_HOURS_PER_ENTRY,
  totalHours,
} from "@/lib/timesheets";
import { formatHours, weekKey, weekStartOf } from "@/lib/timesheet-utils";
import type { FormState } from "@/components/ui";

const entrySchema = z.object({
  date: z
    .string()
    .min(1, "Date requise.")
    .transform((v) => new Date(`${v}T00:00:00Z`))
    .refine((v) => !Number.isNaN(v.getTime()), "Date invalide."),
  projectId: z
    .string()
    .optional()
    .transform((v) => (v ? v : null)),
  workItemId: z
    .string()
    .optional()
    .transform((v) => (v ? v : null)),
  activityTypeId: z.string().min(1, "Type d’activité requis."),
  hours: z.coerce
    .number()
    .min(MIN_HOURS_PER_ENTRY, `Durée minimale : ${MIN_HOURS_PER_ENTRY} h.`)
    .max(MAX_HOURS_PER_DAY, `Durée maximale : ${MAX_HOURS_PER_DAY} h.`),
  comment: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? v.trim() : null)),
});

/** Ajoute ou modifie une ligne de la fiche de temps de l'utilisateur connecté. */
export async function saveTimeEntry(entryId: string | null, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = entrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const data = parsed.data;

  const weekStart = weekStartOf(data.date);
  const sheet = await getOrCreateTimesheet(user.id, weekStart);
  if (!isEditable(sheet.status)) {
    return { error: "Cette semaine est soumise ou validée : elle n’est plus modifiable." };
  }
  if (data.workItemId) {
    const item = await db.workItem.findUnique({ where: { id: data.workItemId } });
    if (!item || (data.projectId && item.projectId !== data.projectId)) {
      return { fieldErrors: { workItemId: ["Cet élément n’appartient pas au projet choisi."] } };
    }
  }

  const sameDay = sheet.entries.filter(
    (entry) => entry.date.toISOString().slice(0, 10) === data.date.toISOString().slice(0, 10) && entry.id !== entryId,
  );
  if (totalHours(sameDay) + data.hours > MAX_HOURS_PER_DAY) {
    return { fieldErrors: { hours: [`Le total de la journée dépasserait ${MAX_HOURS_PER_DAY} h.`] } };
  }

  if (entryId) {
    const before = await db.timeEntry.findUnique({ where: { id: entryId } });
    if (!before || before.userId !== user.id) return { error: "Ligne introuvable." };
    await db.timeEntry.update({ where: { id: entryId }, data });
  } else {
    await db.timeEntry.create({ data: { ...data, userId: user.id, timesheetId: sheet.id } });
  }

  revalidatePath("/temps");
  return { success: entryId ? "Ligne modifiée." : `${formatHours(data.hours)} enregistrée(s).` };
}

export async function deleteTimeEntry(entryId: string) {
  const user = await requireUser();
  const entry = await db.timeEntry.findUnique({ where: { id: entryId }, include: { timesheet: true } });
  if (!entry || entry.userId !== user.id || !isEditable(entry.timesheet.status)) return;
  await db.timeEntry.delete({ where: { id: entryId } });
  revalidatePath("/temps");
}

/** Soumet la semaine au supérieur hiérarchique. */
export async function submitTimesheet(weekStartKey: string): Promise<void> {
  const user = await requireUser();
  const weekStart = new Date(`${weekStartKey}T00:00:00Z`);
  const sheet = await getOrCreateTimesheet(user.id, weekStart);
  if (!isEditable(sheet.status) || sheet.entries.length === 0) return;

  await db.timesheet.update({
    where: { id: sheet.id },
    data: { status: "SOUMIS", submittedAt: new Date(), reviewComment: null, reviewedAt: null, reviewerId: null },
  });
  await audit({
    actor: user,
    action: "UPDATE",
    entity: "Fiche de temps",
    entityId: sheet.id,
    entityLabel: `${displayName(user)} — semaine du ${weekKey(weekStart)}`,
    field: "Statut",
    oldValue: "Brouillon",
    newValue: `Soumise (${formatHours(totalHours(sheet.entries))})`,
  });
  revalidatePath("/temps");
  revalidatePath("/temps/validation");
}

/** Validation ou rejet par le supérieur hiérarchique. */
export async function reviewTimesheet(
  timesheetId: string,
  decision: "VALIDE" | "REJETE",
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const sheet = await db.timesheet.findUnique({
    where: { id: timesheetId },
    include: { user: true, entries: true },
  });
  if (!sheet) return { error: "Fiche introuvable." };
  if (!canReview(user, sheet.user)) return { error: "Vous n’êtes pas le valideur de cette personne." };
  if (sheet.status !== "SOUMIS") return { error: "Cette fiche n’est pas en attente de validation." };

  const comment = String(formData.get("comment") ?? "").trim();
  if (decision === "REJETE" && !comment) {
    return { error: "Indiquez le motif du rejet : il sera transmis à la personne." };
  }

  await db.timesheet.update({
    where: { id: timesheetId },
    data: {
      status: decision,
      reviewedAt: new Date(),
      reviewerId: user.id,
      reviewComment: comment || null,
    },
  });
  await audit({
    actor: user,
    action: "UPDATE",
    entity: "Fiche de temps",
    entityId: timesheetId,
    entityLabel: `${displayName(sheet.user)} — semaine du ${weekKey(sheet.weekStart)}`,
    field: "Statut",
    oldValue: "Soumise",
    newValue: decision === "VALIDE" ? `Validée (${formatHours(totalHours(sheet.entries))})` : `Rejetée : ${comment}`,
  });

  revalidatePath("/temps/validation");
  revalidatePath("/temps");
  return { success: decision === "VALIDE" ? "Fiche validée." : "Fiche rejetée, la personne peut la corriger." };
}

/** Rouvre une fiche validée (autorisation exceptionnelle du valideur). */
export async function reopenTimesheet(timesheetId: string) {
  const user = await requireUser();
  const sheet = await db.timesheet.findUnique({ where: { id: timesheetId }, include: { user: true } });
  if (!sheet || !canReview(user, sheet.user) || sheet.status !== "VALIDE") return;

  await db.timesheet.update({
    where: { id: timesheetId },
    data: { status: "BROUILLON", reviewComment: "Réouverte pour correction", reviewedAt: new Date(), reviewerId: user.id },
  });
  await audit({
    actor: user,
    action: "UPDATE",
    entity: "Fiche de temps",
    entityId: timesheetId,
    entityLabel: `${displayName(sheet.user)} — semaine du ${weekKey(sheet.weekStart)}`,
    field: "Statut",
    oldValue: "Validée",
    newValue: "Réouverte pour correction",
  });
  revalidatePath("/temps/validation");
  revalidatePath("/temps");
}
