"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission, displayName } from "@/lib/auth/session";
import { audit, auditChanges } from "@/lib/audit";
import { refreshActivityProgress } from "@/lib/ptba";
import { PTBA_ACTIVITY_STATUS_LABELS, PTBA_YEAR_STATUS_LABELS } from "@/lib/strategy-labels";
import { PtbaActivityStatus, PtbaYearStatus } from "@/generated/prisma/enums";
import type { FormState } from "@/components/ui";

const optionalId = z
  .string()
  .optional()
  .transform((v) => (v ? v : null));
const optionalText = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : null));
const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? new Date(`${v}T00:00:00Z`) : null))
  .refine((v) => v === null || !Number.isNaN(v.getTime()), "Date invalide.");
const amount = (message: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? Number(v.replace(/\s/g, "").replace(",", ".")) : 0))
    .refine((v) => Number.isFinite(v) && v >= 0, message);
const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on");

const asDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

// ─── Exercices PTBA ─────────────────────────────────────────────────────────

const yearSchema = z.object({
  year: z.coerce.number().int().min(2000, "Année invalide.").max(2100, "Année invalide."),
  label: z.string().trim().min(2, "Intitulé requis."),
  planId: optionalId,
  status: z.enum(PtbaYearStatus),
  comment: optionalText,
});

export async function savePtbaYear(yearId: string | null, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("ptba.manage");
  const parsed = yearSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const data = parsed.data;

  const duplicate = await db.ptbaYear.findUnique({ where: { year: data.year } });
  if (duplicate && duplicate.id !== yearId) return { error: `L’exercice ${data.year} existe déjà.` };

  if (yearId) {
    const before = await db.ptbaYear.findUniqueOrThrow({ where: { id: yearId }, include: { plan: true } });
    const after = await db.ptbaYear.update({ where: { id: yearId }, data, include: { plan: true } });
    await auditChanges(
      { actor: user, entity: "Exercice PTBA", entityId: yearId, entityLabel: after.label },
      {
        year: String(before.year),
        label: before.label,
        plan: before.plan?.code ?? null,
        status: PTBA_YEAR_STATUS_LABELS[before.status],
        comment: before.comment,
      },
      {
        year: String(after.year),
        label: after.label,
        plan: after.plan?.code ?? null,
        status: PTBA_YEAR_STATUS_LABELS[after.status],
        comment: after.comment,
      },
      { year: "Année", label: "Intitulé", plan: "Plan stratégique", status: "Statut", comment: "Commentaire" },
    );
  } else {
    const created = await db.ptbaYear.create({ data });
    await audit({ actor: user, action: "CREATE", entity: "Exercice PTBA", entityId: created.id, entityLabel: created.label });
  }
  revalidatePath("/ptba");
  return { success: yearId ? "Exercice mis à jour." : `Exercice ${data.year} créé.` };
}

export async function deletePtbaYear(yearId: string) {
  const user = await requirePermission("ptba.manage");
  const year = await db.ptbaYear.findUnique({ where: { id: yearId }, include: { activities: true } });
  if (!year || year.activities.length > 0) return;
  await db.ptbaYear.delete({ where: { id: yearId } });
  await audit({ actor: user, action: "DELETE", entity: "Exercice PTBA", entityId: yearId, entityLabel: year.label });
  revalidatePath("/ptba");
}

// ─── Activités PTBA ─────────────────────────────────────────────────────────

const activitySchema = z
  .object({
    yearId: z.string().min(1, "Exercice requis."),
    code: z
      .string()
      .trim()
      .min(1, "Code requis.")
      .max(30, "Code trop long."),
    name: z.string().trim().min(2, "Intitulé requis."),
    description: optionalText,
    resultId: optionalId,
    ownerId: optionalId,
    directionId: optionalId,
    startDate: optionalDate,
    endDate: optionalDate,
    priorityId: optionalId,
    status: z.enum(PtbaActivityStatus),
    progressManual: z
      .string()
      .optional()
      .transform((v) => (v?.trim() ? Number(v.replace(",", ".")) : null))
      .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 100), "Avancement invalide (0 à 100)."),
    progressComment: optionalText,
    q1: checkbox,
    q2: checkbox,
    q3: checkbox,
    q4: checkbox,
    budgetHr: amount("Budget RH invalide."),
    budgetServices: amount("Budget prestations invalide."),
    budgetInvestment: amount("Budget investissements invalide."),
    budgetOperating: amount("Budget fonctionnement invalide."),
    committed: amount("Montant engagé invalide."),
    paid: amount("Montant payé invalide."),
    sortOrder: z.coerce.number().int().min(0).max(9999),
    participants: z.string().optional(),
  })
  .refine((d) => !d.startDate || !d.endDate || d.endDate >= d.startDate, {
    path: ["endDate"],
    message: "La date de fin doit suivre la date de début.",
  })
  .refine((d) => d.q1 || d.q2 || d.q3 || d.q4, {
    path: ["q1"],
    message: "Indiquez au moins un trimestre de réalisation.",
  });

const ACTIVITY_LABELS = {
  code: "Code",
  name: "Intitulé",
  description: "Description",
  result: "Résultat attendu",
  owner: "Responsable",
  direction: "Direction",
  startDate: "Date de début",
  endDate: "Date de fin",
  priority: "Priorité",
  status: "Statut",
  progressManual: "Avancement forcé (%)",
  progressComment: "Justification de l’avancement",
  quarters: "Trimestres",
  budgetHr: "Budget ressources humaines",
  budgetServices: "Budget prestations",
  budgetInvestment: "Budget investissements",
  budgetOperating: "Budget fonctionnement",
  committed: "Montant engagé",
  paid: "Montant payé",
};

const activityInclude = { owner: true, direction: true, priority: true, result: true } as const;

type ActivityView = {
  code: string;
  name: string;
  description: string | null;
  result: { code: string } | null;
  owner: { firstName: string; lastName: string } | null;
  direction: { name: string } | null;
  startDate: Date | null;
  endDate: Date | null;
  priority: { label: string } | null;
  status: PtbaActivityStatus;
  progressManual: { toString(): string } | null;
  progressComment: string | null;
  q1: boolean;
  q2: boolean;
  q3: boolean;
  q4: boolean;
  budgetHr: { toString(): string };
  budgetServices: { toString(): string };
  budgetInvestment: { toString(): string };
  budgetOperating: { toString(): string };
  committed: { toString(): string };
  paid: { toString(): string };
};

const quarterLabel = (a: ActivityView) =>
  [a.q1 && "T1", a.q2 && "T2", a.q3 && "T3", a.q4 && "T4"].filter(Boolean).join(", ") || "—";

const activityView = (a: ActivityView) => ({
  code: a.code,
  name: a.name,
  description: a.description,
  result: a.result?.code ?? null,
  owner: a.owner ? displayName(a.owner) : null,
  direction: a.direction?.name ?? null,
  startDate: asDate(a.startDate),
  endDate: asDate(a.endDate),
  priority: a.priority?.label ?? null,
  status: PTBA_ACTIVITY_STATUS_LABELS[a.status],
  progressManual: a.progressManual === null ? null : String(a.progressManual),
  progressComment: a.progressComment,
  quarters: quarterLabel(a),
  budgetHr: String(a.budgetHr),
  budgetServices: String(a.budgetServices),
  budgetInvestment: String(a.budgetInvestment),
  budgetOperating: String(a.budgetOperating),
  committed: String(a.committed),
  paid: String(a.paid),
});

export async function saveActivity(
  activityId: string | null,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission("ptba.manage");
  const parsed = activitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { participants, ...data } = parsed.data;

  const year = await db.ptbaYear.findUnique({ where: { id: data.yearId } });
  if (!year) return { error: "Exercice introuvable." };
  if (year.status === "CLOS") return { error: "Cet exercice est clos : les activités ne sont plus modifiables." };

  const duplicate = await db.ptbaActivity.findFirst({ where: { yearId: data.yearId, code: data.code } });
  if (duplicate && duplicate.id !== activityId) {
    return { fieldErrors: { code: [`Le code « ${data.code} » existe déjà dans cet exercice.`] } };
  }
  if (data.progressManual !== null && !data.progressComment) {
    return { fieldErrors: { progressComment: ["Justifiez l’avancement saisi manuellement."] } };
  }

  const participantIds = (participants ?? "").split(",").map((v) => v.trim()).filter(Boolean);

  const activity = activityId
    ? await db.ptbaActivity.update({ where: { id: activityId }, data, include: activityInclude })
    : await db.ptbaActivity.create({ data, include: activityInclude });

  await db.ptbaParticipant.deleteMany({ where: { activityId: activity.id, userId: { notIn: participantIds } } });
  for (const userId of participantIds) {
    await db.ptbaParticipant.upsert({
      where: { activityId_userId: { activityId: activity.id, userId } },
      update: {},
      create: { activityId: activity.id, userId },
    });
  }

  if (activityId) {
    const before = await db.ptbaActivity.findUnique({ where: { id: activityId }, include: activityInclude });
    if (before) {
      await auditChanges(
        { actor: user, entity: "Activité PTBA", entityId: activityId, entityLabel: `${activity.code} — ${activity.name}` },
        activityView(before),
        activityView(activity),
        ACTIVITY_LABELS,
      );
    }
  } else {
    await audit({
      actor: user,
      action: "CREATE",
      entity: "Activité PTBA",
      entityId: activity.id,
      entityLabel: `${activity.code} — ${activity.name}`,
    });
  }

  await refreshActivityProgress(activity.id);
  revalidatePath("/ptba");
  revalidatePath(`/ptba/${activity.id}`);
  return { success: activityId ? "Activité mise à jour." : `Activité ${data.code} ajoutée.` };
}

export async function deleteActivity(activityId: string) {
  const user = await requirePermission("ptba.manage");
  const activity = await db.ptbaActivity.findUnique({ where: { id: activityId }, include: { year: true } });
  if (!activity || activity.year.status === "CLOS") return;

  await db.ptbaActivity.delete({ where: { id: activityId } });
  await audit({
    actor: user,
    action: "DELETE",
    entity: "Activité PTBA",
    entityId: activityId,
    entityLabel: `${activity.code} — ${activity.name}`,
  });
  revalidatePath("/ptba");
  redirect("/ptba");
}

/** Mise à jour rapide du statut depuis le portefeuille. */
export async function setActivityStatus(activityId: string, formData: FormData) {
  const user = await requirePermission("ptba.manage");
  const raw = String(formData.get("status") ?? "");
  if (!(raw in PTBA_ACTIVITY_STATUS_LABELS)) return;
  const status = raw as PtbaActivityStatus;

  const before = await db.ptbaActivity.findUnique({ where: { id: activityId }, include: { year: true } });
  if (!before || before.year.status === "CLOS") return;

  await db.ptbaActivity.update({ where: { id: activityId }, data: { status } });
  await audit({
    actor: user,
    action: "UPDATE",
    entity: "Activité PTBA",
    entityId: activityId,
    entityLabel: `${before.code} — ${before.name}`,
    field: "Statut",
    oldValue: PTBA_ACTIVITY_STATUS_LABELS[before.status],
    newValue: PTBA_ACTIVITY_STATUS_LABELS[status],
  });
  revalidatePath("/ptba");
  revalidatePath(`/ptba/${activityId}`);
}
