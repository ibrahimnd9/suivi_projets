"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, displayName } from "@/lib/auth/session";
import { canEditProject } from "@/lib/auth/permissions";
import { audit, auditChanges } from "@/lib/audit";
import { KpiDirection, KpiFrequency, RiskKind, RiskStatus } from "@/generated/prisma/enums";
import { RISK_STATUS_LABELS } from "@/lib/monitoring";
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
const decimal = (message: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? Number(v.replace(/\s/g, "").replace(",", ".")) : null))
    .refine((v) => v === null || Number.isFinite(v), message);
const amount = (message: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? Number(v.replace(/\s/g, "").replace(",", ".")) : 0))
    .refine((v) => Number.isFinite(v) && v >= 0, message);

async function requireEditableProject(projectId: string) {
  const user = await requireUser();
  const project = await db.project.findUnique({ where: { id: projectId }, include: { members: true } });
  if (!project) return { error: "Projet introuvable." as const };
  if (!canEditProject(user, project)) return { error: "Vous n’êtes pas autorisé à modifier ce projet." as const };
  return { user, project };
}

const asDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const asText = (v: { toString(): string } | null) => (v === null ? null : String(v));

// ─── Indicateurs ────────────────────────────────────────────────────────────

const kpiSchema = z.object({
  name: z.string().trim().min(2, "Nom de l’indicateur requis."),
  definition: optionalText,
  typeId: optionalId,
  unit: optionalText,
  frequency: z.enum(KpiFrequency),
  direction: z.enum(KpiDirection),
  baseline: decimal("Valeur de référence invalide."),
  target: decimal("Valeur cible invalide."),
  ownerId: optionalId,
  source: optionalText,
  alertThreshold: z.coerce.number().min(0).max(200),
  okThreshold: z.coerce.number().min(0).max(200),
  sortOrder: z.coerce.number().int().min(0).max(9999),
});

const KPI_LABELS = {
  name: "Nom de l’indicateur",
  definition: "Définition",
  type: "Type",
  unit: "Unité",
  frequency: "Fréquence",
  direction: "Sens",
  baseline: "Valeur de référence",
  target: "Cible",
  owner: "Responsable",
  source: "Source de données",
  alertThreshold: "Seuil d’alerte (%)",
  okThreshold: "Seuil d’atteinte (%)",
};

const kpiInclude = { type: true, owner: true } as const;

const kpiView = (k: {
  name: string;
  definition: string | null;
  type: { label: string } | null;
  unit: string | null;
  frequency: KpiFrequency;
  direction: KpiDirection;
  baseline: { toString(): string } | null;
  target: { toString(): string } | null;
  owner: { firstName: string; lastName: string } | null;
  source: string | null;
  alertThreshold: { toString(): string };
  okThreshold: { toString(): string };
}) => ({
  name: k.name,
  definition: k.definition,
  type: k.type?.label ?? null,
  unit: k.unit,
  frequency: k.frequency,
  direction: k.direction,
  baseline: asText(k.baseline),
  target: asText(k.target),
  owner: k.owner ? displayName(k.owner) : null,
  source: k.source,
  alertThreshold: String(k.alertThreshold),
  okThreshold: String(k.okThreshold),
});

export async function saveKpi(projectId: string, kpiId: string | null, _: FormState, formData: FormData): Promise<FormState> {
  const context = await requireEditableProject(projectId);
  if ("error" in context) return { error: context.error };
  const parsed = kpiSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const data = parsed.data;
  if (data.alertThreshold > data.okThreshold) {
    return { fieldErrors: { alertThreshold: ["Le seuil d’alerte doit être inférieur au seuil d’atteinte."] } };
  }

  if (kpiId) {
    const before = await db.kpi.findUnique({ where: { id: kpiId }, include: kpiInclude });
    if (!before || before.projectId !== projectId) return { error: "Indicateur introuvable." };
    const after = await db.kpi.update({ where: { id: kpiId }, data, include: kpiInclude });
    await auditChanges(
      { actor: context.user, entity: "Indicateur", entityId: kpiId, entityLabel: after.name },
      kpiView(before),
      kpiView(after),
      KPI_LABELS,
    );
  } else {
    const created = await db.kpi.create({ data: { ...data, projectId } });
    await audit({ actor: context.user, action: "CREATE", entity: "Indicateur", entityId: created.id, entityLabel: created.name });
  }
  revalidatePath(`/projets/${projectId}/indicateurs`);
  return { success: kpiId ? "Indicateur mis à jour." : `Indicateur « ${data.name} » ajouté.` };
}

export async function deleteKpi(projectId: string, kpiId: string) {
  const context = await requireEditableProject(projectId);
  if ("error" in context) return;
  const kpi = await db.kpi.findUnique({ where: { id: kpiId } });
  if (!kpi || kpi.projectId !== projectId) return;
  await db.kpi.delete({ where: { id: kpiId } });
  await audit({ actor: context.user, action: "DELETE", entity: "Indicateur", entityId: kpiId, entityLabel: kpi.name });
  revalidatePath(`/projets/${projectId}/indicateurs`);
}

/** Saisie d'une valeur mesurée pour une période. */
export async function saveKpiValue(projectId: string, kpiId: string, _: FormState, formData: FormData): Promise<FormState> {
  const context = await requireEditableProject(projectId);
  if ("error" in context) return { error: context.error };
  const parsed = z
    .object({
      period: z
        .string()
        .min(1, "Période requise.")
        .transform((v) => new Date(`${v}T00:00:00Z`))
        .refine((v) => !Number.isNaN(v.getTime()), "Période invalide."),
      value: z
        .string()
        .min(1, "Valeur requise.")
        .transform((v) => Number(v.replace(/\s/g, "").replace(",", ".")))
        .refine((v) => Number.isFinite(v), "Valeur numérique attendue."),
      comment: optionalText,
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { period, value, comment } = parsed.data;

  const kpi = await db.kpi.findUnique({ where: { id: kpiId } });
  if (!kpi || kpi.projectId !== projectId) return { error: "Indicateur introuvable." };

  const previous = await db.kpiValue.findUnique({ where: { kpiId_period: { kpiId, period } } });
  await db.kpiValue.upsert({
    where: { kpiId_period: { kpiId, period } },
    update: { value, comment, recordedById: context.user.id },
    create: { kpiId, period, value, comment, recordedById: context.user.id },
  });
  await audit({
    actor: context.user,
    action: "UPDATE",
    entity: "Indicateur",
    entityId: kpiId,
    entityLabel: kpi.name,
    field: `Valeur au ${period.toISOString().slice(0, 10)}`,
    oldValue: previous ? String(previous.value) : null,
    newValue: String(value),
  });
  revalidatePath(`/projets/${projectId}/indicateurs`);
  return { success: "Valeur enregistrée." };
}

// ─── Diligences ─────────────────────────────────────────────────────────────

const diligenceSchema = z.object({
  title: z.string().trim().min(2, "Intitulé de l’action requis."),
  origin: optionalText,
  description: optionalText,
  ownerId: optionalId,
  issuedAt: optionalDate,
  dueDate: optionalDate,
  closedAt: optionalDate,
  statusId: z.string().min(1, "Statut requis."),
  priorityId: optionalId,
  comment: optionalText,
  proofUrl: optionalText,
  meetingId: optionalId,
});

const DILIGENCE_LABELS = {
  title: "Action",
  origin: "Origine",
  description: "Description",
  owner: "Responsable",
  issuedAt: "Date d’émission",
  dueDate: "Date d’échéance",
  closedAt: "Date de clôture",
  status: "Statut",
  priority: "Priorité",
  comment: "Commentaire",
  proofUrl: "Preuve",
  meeting: "Réunion d’origine",
};

const diligenceInclude = { owner: true, status: true, priority: true, meeting: true } as const;

const diligenceView = (d: {
  title: string;
  origin: string | null;
  description: string | null;
  owner: { firstName: string; lastName: string } | null;
  issuedAt: Date | null;
  dueDate: Date | null;
  closedAt: Date | null;
  status: { label: string };
  priority: { label: string } | null;
  comment: string | null;
  proofUrl: string | null;
  meeting: { subject: string } | null;
}) => ({
  title: d.title,
  origin: d.origin,
  description: d.description,
  owner: d.owner ? displayName(d.owner) : null,
  issuedAt: asDate(d.issuedAt),
  dueDate: asDate(d.dueDate),
  closedAt: asDate(d.closedAt),
  status: d.status.label,
  priority: d.priority?.label ?? null,
  comment: d.comment,
  proofUrl: d.proofUrl,
  meeting: d.meeting?.subject ?? null,
});

export async function saveDiligence(
  projectId: string,
  diligenceId: string | null,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireEditableProject(projectId);
  if ("error" in context) return { error: context.error };
  const parsed = diligenceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const data = parsed.data;

  const status = await db.refItem.findUnique({ where: { id: data.statusId } });
  const done = (status?.meta as { done?: boolean } | null)?.done === true;
  if (done && !data.closedAt) data.closedAt = new Date();
  if (!done) data.closedAt = null;

  if (diligenceId) {
    const before = await db.diligence.findUnique({ where: { id: diligenceId }, include: diligenceInclude });
    if (!before || before.projectId !== projectId) return { error: "Diligence introuvable." };
    const after = await db.diligence.update({ where: { id: diligenceId }, data, include: diligenceInclude });
    await auditChanges(
      { actor: context.user, entity: "Diligence", entityId: diligenceId, entityLabel: after.title },
      diligenceView(before),
      diligenceView(after),
      DILIGENCE_LABELS,
    );
  } else {
    const created = await db.diligence.create({ data: { ...data, projectId } });
    await audit({ actor: context.user, action: "CREATE", entity: "Diligence", entityId: created.id, entityLabel: created.title });
  }
  revalidatePath(`/projets/${projectId}/diligences`);
  return { success: diligenceId ? "Diligence mise à jour." : "Diligence ajoutée." };
}

export async function deleteDiligence(projectId: string, diligenceId: string) {
  const context = await requireEditableProject(projectId);
  if ("error" in context) return;
  const diligence = await db.diligence.findUnique({ where: { id: diligenceId } });
  if (!diligence || diligence.projectId !== projectId) return;
  await db.diligence.delete({ where: { id: diligenceId } });
  await audit({ actor: context.user, action: "DELETE", entity: "Diligence", entityId: diligenceId, entityLabel: diligence.title });
  revalidatePath(`/projets/${projectId}/diligences`);
}

// ─── Risques ────────────────────────────────────────────────────────────────

const riskSchema = z.object({
  kind: z.enum(RiskKind),
  title: z.string().trim().min(2, "Intitulé requis."),
  categoryId: optionalId,
  description: optionalText,
  probability: z.coerce.number().int().min(1).max(5),
  impact: z.coerce.number().int().min(1).max(5),
  ownerId: optionalId,
  identifiedAt: optionalDate,
  mitigationPlan: optionalText,
  dueDate: optionalDate,
  status: z.enum(RiskStatus),
});

const RISK_LABELS = {
  kind: "Nature",
  title: "Intitulé",
  category: "Catégorie",
  description: "Description",
  probability: "Probabilité",
  impact: "Impact",
  owner: "Responsable",
  identifiedAt: "Date d’identification",
  mitigationPlan: "Plan de mitigation",
  dueDate: "Échéance",
  status: "Statut",
};

const riskInclude = { owner: true, category: true } as const;

const riskView = (r: {
  kind: RiskKind;
  title: string;
  category: { label: string } | null;
  description: string | null;
  probability: number;
  impact: number;
  owner: { firstName: string; lastName: string } | null;
  identifiedAt: Date | null;
  mitigationPlan: string | null;
  dueDate: Date | null;
  status: RiskStatus;
}) => ({
  kind: r.kind,
  title: r.title,
  category: r.category?.label ?? null,
  description: r.description,
  probability: String(r.probability),
  impact: String(r.impact),
  owner: r.owner ? displayName(r.owner) : null,
  identifiedAt: asDate(r.identifiedAt),
  mitigationPlan: r.mitigationPlan,
  dueDate: asDate(r.dueDate),
  status: RISK_STATUS_LABELS[r.status],
});

export async function saveRisk(projectId: string, riskId: string | null, _: FormState, formData: FormData): Promise<FormState> {
  const context = await requireEditableProject(projectId);
  if ("error" in context) return { error: context.error };
  const parsed = riskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const data = parsed.data;

  if (riskId) {
    const before = await db.risk.findUnique({ where: { id: riskId }, include: riskInclude });
    if (!before || before.projectId !== projectId) return { error: "Risque introuvable." };
    const after = await db.risk.update({ where: { id: riskId }, data, include: riskInclude });
    await auditChanges(
      { actor: context.user, entity: "Risque", entityId: riskId, entityLabel: after.title },
      riskView(before),
      riskView(after),
      RISK_LABELS,
    );
  } else {
    const created = await db.risk.create({ data: { ...data, projectId, identifiedAt: data.identifiedAt ?? new Date() } });
    await audit({ actor: context.user, action: "CREATE", entity: "Risque", entityId: created.id, entityLabel: created.title });
  }
  revalidatePath(`/projets/${projectId}/risques`);
  return { success: riskId ? "Risque mis à jour." : "Risque enregistré." };
}

export async function deleteRisk(projectId: string, riskId: string) {
  const context = await requireEditableProject(projectId);
  if ("error" in context) return;
  const risk = await db.risk.findUnique({ where: { id: riskId } });
  if (!risk || risk.projectId !== projectId) return;
  await db.risk.delete({ where: { id: riskId } });
  await audit({ actor: context.user, action: "DELETE", entity: "Risque", entityId: riskId, entityLabel: risk.title });
  revalidatePath(`/projets/${projectId}/risques`);
}

// ─── Budget ─────────────────────────────────────────────────────────────────

const budgetSchema = z.object({
  label: z.string().trim().min(2, "Libellé de la ligne requis."),
  natureId: optionalId,
  workItemId: optionalId,
  period: optionalDate,
  initial: amount("Montant initial invalide."),
  revised: decimal("Montant révisé invalide."),
  committed: amount("Montant engagé invalide."),
  spent: amount("Montant réalisé invalide."),
  comment: optionalText,
  sortOrder: z.coerce.number().int().min(0).max(9999),
});

const BUDGET_LABELS = {
  label: "Libellé",
  nature: "Nature de dépense",
  workItem: "Rattachement",
  period: "Période",
  initial: "Budget initial",
  revised: "Budget révisé",
  committed: "Engagements",
  spent: "Dépenses réalisées",
  comment: "Commentaire",
};

const budgetInclude = { nature: true, workItem: true } as const;

const budgetView = (b: {
  label: string;
  nature: { label: string } | null;
  workItem: { name: string } | null;
  period: Date | null;
  initial: { toString(): string };
  revised: { toString(): string } | null;
  committed: { toString(): string };
  spent: { toString(): string };
  comment: string | null;
}) => ({
  label: b.label,
  nature: b.nature?.label ?? null,
  workItem: b.workItem?.name ?? null,
  period: asDate(b.period),
  initial: String(b.initial),
  revised: asText(b.revised),
  committed: String(b.committed),
  spent: String(b.spent),
  comment: b.comment,
});

export async function saveBudgetLine(
  projectId: string,
  lineId: string | null,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireEditableProject(projectId);
  if ("error" in context) return { error: context.error };
  const parsed = budgetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const data = parsed.data;

  if (data.workItemId) {
    const item = await db.workItem.findUnique({ where: { id: data.workItemId } });
    if (!item || item.projectId !== projectId) return { error: "Rattachement invalide." };
  }

  if (lineId) {
    const before = await db.budgetLine.findUnique({ where: { id: lineId }, include: budgetInclude });
    if (!before || before.projectId !== projectId) return { error: "Ligne introuvable." };
    const after = await db.budgetLine.update({ where: { id: lineId }, data, include: budgetInclude });
    await auditChanges(
      { actor: context.user, entity: "Budget", entityId: lineId, entityLabel: after.label },
      budgetView(before),
      budgetView(after),
      BUDGET_LABELS,
    );
  } else {
    const created = await db.budgetLine.create({ data: { ...data, projectId } });
    await audit({ actor: context.user, action: "CREATE", entity: "Budget", entityId: created.id, entityLabel: created.label });
  }
  revalidatePath(`/projets/${projectId}/budget`);
  return { success: lineId ? "Ligne mise à jour." : "Ligne budgétaire ajoutée." };
}

export async function deleteBudgetLine(projectId: string, lineId: string) {
  const context = await requireEditableProject(projectId);
  if ("error" in context) return;
  const line = await db.budgetLine.findUnique({ where: { id: lineId } });
  if (!line || line.projectId !== projectId) return;
  await db.budgetLine.delete({ where: { id: lineId } });
  await audit({ actor: context.user, action: "DELETE", entity: "Budget", entityId: lineId, entityLabel: line.label });
  revalidatePath(`/projets/${projectId}/budget`);
}
