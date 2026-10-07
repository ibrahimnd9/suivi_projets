"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission, displayName } from "@/lib/auth/session";
import { audit, auditChanges } from "@/lib/audit";
import { STRATEGIC_STATUS_LABELS } from "@/lib/strategy-labels";
import { KpiFrequency, StrategicStatus } from "@/generated/prisma/enums";
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
const optionalAmount = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? Number(v.replace(/\s/g, "").replace(",", ".")) : null))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0), "Montant invalide.");
const code = z
  .string()
  .trim()
  .min(1, "Code requis.")
  .max(30, "Code trop long.")
  .transform((v) => v.toUpperCase());

const asDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const asAmount = (v: { toString(): string } | null) => (v === null ? null : String(v));

// ─── Plan stratégique ───────────────────────────────────────────────────────

const planSchema = z.object({
  code,
  name: z.string().trim().min(2, "Intitulé requis."),
  startYear: z.coerce.number().int().min(2000).max(2100),
  endYear: z.coerce.number().int().min(2000).max(2100),
  vision: optionalText,
  mission: optionalText,
  orientations: optionalText,
});

export async function savePlan(planId: string | null, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("strategy.manage");
  const parsed = planSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const data = parsed.data;
  if (data.endYear < data.startYear) {
    return { fieldErrors: { endYear: ["L’année de fin doit suivre l’année de début."] } };
  }

  const duplicate = await db.strategicPlan.findUnique({ where: { code: data.code } });
  if (duplicate && duplicate.id !== planId) return { error: `Le code « ${data.code} » existe déjà.` };

  if (planId) {
    const before = await db.strategicPlan.findUniqueOrThrow({ where: { id: planId } });
    const after = await db.strategicPlan.update({ where: { id: planId }, data });
    await auditChanges(
      { actor: user, entity: "Plan stratégique", entityId: planId, entityLabel: after.name },
      { ...before, startYear: String(before.startYear), endYear: String(before.endYear) },
      { ...after, startYear: String(after.startYear), endYear: String(after.endYear) },
      {
        code: "Code",
        name: "Intitulé",
        startYear: "Année de début",
        endYear: "Année de fin",
        vision: "Vision",
        mission: "Mission",
        orientations: "Orientations",
      },
    );
  } else {
    const created = await db.strategicPlan.create({ data });
    await audit({ actor: user, action: "CREATE", entity: "Plan stratégique", entityId: created.id, entityLabel: created.name });
  }
  revalidatePath("/strategie");
  return { success: planId ? "Plan stratégique mis à jour." : `Plan « ${data.name} » créé.` };
}

// ─── Axes ───────────────────────────────────────────────────────────────────

const axisSchema = z.object({
  planId: z.string().min(1, "Plan stratégique requis."),
  code,
  name: z.string().trim().min(2, "Intitulé requis."),
  description: optionalText,
  ownerId: optionalId,
  startDate: optionalDate,
  endDate: optionalDate,
  status: z.enum(StrategicStatus),
  budget: optionalAmount,
  sortOrder: z.coerce.number().int().min(0).max(9999),
  refItemId: optionalId,
});

const levelInclude = { owner: true } as const;

export async function saveAxis(axisId: string | null, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("strategy.manage");
  const parsed = axisSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const data = parsed.data;
  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    return { fieldErrors: { endDate: ["La date de fin doit suivre la date de début."] } };
  }

  const duplicate = await db.strategicAxis.findFirst({ where: { planId: data.planId, code: data.code } });
  if (duplicate && duplicate.id !== axisId) return { error: `Le code « ${data.code} » existe déjà dans ce plan.` };

  const view = (a: { code: string; name: string; description: string | null; owner: { firstName: string; lastName: string } | null; startDate: Date | null; endDate: Date | null; status: StrategicStatus; budget: { toString(): string } | null }) => ({
    code: a.code,
    name: a.name,
    description: a.description,
    owner: a.owner ? displayName(a.owner) : null,
    startDate: asDate(a.startDate),
    endDate: asDate(a.endDate),
    status: STRATEGIC_STATUS_LABELS[a.status],
    budget: asAmount(a.budget),
  });
  const labels = {
    code: "Code",
    name: "Intitulé",
    description: "Description",
    owner: "Responsable",
    startDate: "Date de début",
    endDate: "Date de fin",
    status: "Statut",
    budget: "Budget",
  };

  if (axisId) {
    const before = await db.strategicAxis.findUniqueOrThrow({ where: { id: axisId }, include: levelInclude });
    const after = await db.strategicAxis.update({ where: { id: axisId }, data, include: levelInclude });
    await auditChanges({ actor: user, entity: "Axe stratégique", entityId: axisId, entityLabel: after.name }, view(before), view(after), labels);
  } else {
    const created = await db.strategicAxis.create({ data });
    await audit({ actor: user, action: "CREATE", entity: "Axe stratégique", entityId: created.id, entityLabel: `${created.code} — ${created.name}` });
  }
  revalidatePath("/strategie");
  return { success: axisId ? "Axe mis à jour." : `Axe « ${data.name} » ajouté.` };
}

// ─── Objectifs ──────────────────────────────────────────────────────────────

const objectiveSchema = z.object({
  axisId: z.string().min(1, "Axe requis."),
  code,
  name: z.string().trim().min(2, "Intitulé requis."),
  description: optionalText,
  ownerId: optionalId,
  status: z.enum(StrategicStatus),
  budget: optionalAmount,
  sortOrder: z.coerce.number().int().min(0).max(9999),
});

export async function saveObjective(objectiveId: string | null, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("strategy.manage");
  const parsed = objectiveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const data = parsed.data;

  const duplicate = await db.strategicObjective.findFirst({ where: { axisId: data.axisId, code: data.code } });
  if (duplicate && duplicate.id !== objectiveId) return { error: `Le code « ${data.code} » existe déjà dans cet axe.` };

  const view = (o: { code: string; name: string; description: string | null; owner: { firstName: string; lastName: string } | null; status: StrategicStatus; budget: { toString(): string } | null }) => ({
    code: o.code,
    name: o.name,
    description: o.description,
    owner: o.owner ? displayName(o.owner) : null,
    status: STRATEGIC_STATUS_LABELS[o.status],
    budget: asAmount(o.budget),
  });
  const labels = { code: "Code", name: "Intitulé", description: "Description", owner: "Responsable", status: "Statut", budget: "Budget" };

  if (objectiveId) {
    const before = await db.strategicObjective.findUniqueOrThrow({ where: { id: objectiveId }, include: levelInclude });
    const after = await db.strategicObjective.update({ where: { id: objectiveId }, data, include: levelInclude });
    await auditChanges({ actor: user, entity: "Objectif stratégique", entityId: objectiveId, entityLabel: after.name }, view(before), view(after), labels);
  } else {
    const created = await db.strategicObjective.create({ data });
    await audit({ actor: user, action: "CREATE", entity: "Objectif stratégique", entityId: created.id, entityLabel: `${created.code} — ${created.name}` });
  }
  revalidatePath("/strategie");
  return { success: objectiveId ? "Objectif mis à jour." : `Objectif « ${data.name} » ajouté.` };
}

// ─── Résultats attendus ─────────────────────────────────────────────────────

const resultSchema = z.object({
  objectiveId: z.string().min(1, "Objectif requis."),
  code,
  description: z.string().trim().min(2, "Description requise."),
  ownerId: optionalId,
  status: z.enum(StrategicStatus),
  frequency: z.enum(KpiFrequency),
  verification: optionalText,
  sortOrder: z.coerce.number().int().min(0).max(9999),
});

export async function saveResult(resultId: string | null, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("strategy.manage");
  const parsed = resultSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const data = parsed.data;

  const duplicate = await db.expectedResult.findFirst({ where: { objectiveId: data.objectiveId, code: data.code } });
  if (duplicate && duplicate.id !== resultId) return { error: `Le code « ${data.code} » existe déjà pour cet objectif.` };

  const view = (r: { code: string; description: string; owner: { firstName: string; lastName: string } | null; status: StrategicStatus; frequency: KpiFrequency; verification: string | null }) => ({
    code: r.code,
    description: r.description,
    owner: r.owner ? displayName(r.owner) : null,
    status: STRATEGIC_STATUS_LABELS[r.status],
    frequency: r.frequency,
    verification: r.verification,
  });
  const labels = {
    code: "Code",
    description: "Description",
    owner: "Responsable",
    status: "État",
    frequency: "Fréquence de mesure",
    verification: "Source de vérification",
  };

  if (resultId) {
    const before = await db.expectedResult.findUniqueOrThrow({ where: { id: resultId }, include: levelInclude });
    const after = await db.expectedResult.update({ where: { id: resultId }, data, include: levelInclude });
    await auditChanges({ actor: user, entity: "Résultat attendu", entityId: resultId, entityLabel: after.code }, view(before), view(after), labels);
  } else {
    const created = await db.expectedResult.create({ data });
    await audit({ actor: user, action: "CREATE", entity: "Résultat attendu", entityId: created.id, entityLabel: `${created.code} — ${created.description}` });
  }
  revalidatePath("/strategie");
  return { success: resultId ? "Résultat mis à jour." : "Résultat attendu ajouté." };
}

// ─── Suppressions ───────────────────────────────────────────────────────────

/** Suppression d'un niveau de la chaîne, refusée s'il porte encore des éléments. */
export async function deleteStrategyNode(level: "plan" | "axe" | "objectif" | "resultat", id: string) {
  const user = await requirePermission("strategy.manage");

  if (level === "plan") {
    const plan = await db.strategicPlan.findUnique({ where: { id }, include: { axes: true, ptbaYears: true } });
    if (!plan || plan.axes.length > 0 || plan.ptbaYears.length > 0) return;
    await db.strategicPlan.delete({ where: { id } });
    await audit({ actor: user, action: "DELETE", entity: "Plan stratégique", entityId: id, entityLabel: plan.name });
  }
  if (level === "axe") {
    const axis = await db.strategicAxis.findUnique({ where: { id }, include: { objectives: true } });
    if (!axis || axis.objectives.length > 0) return;
    await db.strategicAxis.delete({ where: { id } });
    await audit({ actor: user, action: "DELETE", entity: "Axe stratégique", entityId: id, entityLabel: axis.name });
  }
  if (level === "objectif") {
    const objective = await db.strategicObjective.findUnique({ where: { id }, include: { results: true } });
    if (!objective || objective.results.length > 0) return;
    await db.strategicObjective.delete({ where: { id } });
    await audit({ actor: user, action: "DELETE", entity: "Objectif stratégique", entityId: id, entityLabel: objective.name });
  }
  if (level === "resultat") {
    const result = await db.expectedResult.findUnique({ where: { id }, include: { activities: true } });
    if (!result || result.activities.length > 0) return;
    await db.expectedResult.delete({ where: { id } });
    await audit({ actor: user, action: "DELETE", entity: "Résultat attendu", entityId: id, entityLabel: result.code });
  }
  revalidatePath("/strategie");
}
