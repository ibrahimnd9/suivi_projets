"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { displayName, requireUser } from "@/lib/auth/session";
import { can, canEditProject } from "@/lib/auth/permissions";
import { audit, auditChanges } from "@/lib/audit";
import { nextProjectCode } from "@/lib/projects";
import { parseFieldValue, suggestFieldCode } from "@/lib/custom-fields";
import { FieldType, ProjectRole } from "@/generated/prisma/enums";
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
  .transform((v) => (v?.trim() ? new Date(v) : null))
  .refine((v) => v === null || !Number.isNaN(v.getTime()), "Date invalide.");
const optionalAmount = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? Number(v.replace(/\s/g, "").replace(",", ".")) : null))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0), "Montant invalide.");

const projectSchema = z
  .object({
    name: z.string().trim().min(3, "Le nom du projet est requis (3 caractères minimum)."),
    description: optionalText,
    goal: optionalText,
    objectives: optionalText,
    typeId: optionalId,
    categoryId: optionalId,
    priorityId: optionalId,
    statusId: z.string().min(1, "Statut requis."),
    directionId: optionalId,
    poleId: optionalId,
    sponsorId: optionalId,
    ownerId: optionalId,
    leadId: optionalId,
    externalStakeholders: optionalText,
    startDate: optionalDate,
    endDatePlanned: optionalDate,
    endDateActual: optionalDate,
    progress: z.coerce.number().min(0, "Avancement invalide.").max(100, "Avancement invalide."),
    strategic: z
      .string()
      .optional()
      .transform((v) => v === "on"),
    strategicAxisId: optionalId,
    strategicObjective: optionalText,
    ptbaReference: optionalText,
    ptbaActivity: optionalText,
    budgetPlanned: optionalAmount,
    fundingSourceId: optionalId,
  })
  .refine((d) => !d.startDate || !d.endDatePlanned || d.endDatePlanned >= d.startDate, {
    path: ["endDatePlanned"],
    message: "La date de fin prévue doit suivre la date de début.",
  });

const FIELD_LABELS = {
  name: "Nom du projet",
  description: "Description",
  goal: "Objectif général",
  objectives: "Objectifs spécifiques",
  type: "Type de projet",
  category: "Catégorie",
  priority: "Priorité",
  status: "Statut",
  direction: "Direction porteuse",
  pole: "Pôle",
  sponsor: "Sponsor",
  owner: "Responsable",
  lead: "Chef de projet",
  externalStakeholders: "Parties prenantes externes",
  startDate: "Date de début",
  endDatePlanned: "Date de fin prévue",
  endDateActual: "Date de fin réelle",
  progress: "Avancement (%)",
  strategic: "Projet stratégique",
  strategicAxis: "Axe stratégique",
  strategicObjective: "Objectif stratégique",
  ptbaReference: "Lien avec le PTBA",
  ptbaActivity: "Activité PTBA",
  budgetPlanned: "Budget prévu",
  fundingSource: "Source de financement",
};

type ProjectWithRefs = {
  name: string;
  description: string | null;
  goal: string | null;
  objectives: string | null;
  type: { label: string } | null;
  category: { label: string } | null;
  priority: { label: string } | null;
  status: { label: string };
  direction: { name: string } | null;
  pole: { name: string } | null;
  sponsor: { firstName: string; lastName: string } | null;
  owner: { firstName: string; lastName: string } | null;
  lead: { firstName: string; lastName: string } | null;
  externalStakeholders: string | null;
  startDate: Date | null;
  endDatePlanned: Date | null;
  endDateActual: Date | null;
  progress: unknown;
  strategic: boolean;
  strategicAxis: { label: string } | null;
  strategicObjective: string | null;
  ptbaReference: string | null;
  ptbaActivity: string | null;
  budgetPlanned: unknown;
  fundingSource: { label: string } | null;
};

const asDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const asPerson = (u: { firstName: string; lastName: string } | null) => (u ? `${u.firstName} ${u.lastName}` : null);

function auditView(p: ProjectWithRefs) {
  return {
    name: p.name,
    description: p.description,
    goal: p.goal,
    objectives: p.objectives,
    type: p.type?.label ?? null,
    category: p.category?.label ?? null,
    priority: p.priority?.label ?? null,
    status: p.status.label,
    direction: p.direction?.name ?? null,
    pole: p.pole?.name ?? null,
    sponsor: asPerson(p.sponsor),
    owner: asPerson(p.owner),
    lead: asPerson(p.lead),
    externalStakeholders: p.externalStakeholders,
    startDate: asDate(p.startDate),
    endDatePlanned: asDate(p.endDatePlanned),
    endDateActual: asDate(p.endDateActual),
    progress: String(p.progress),
    strategic: p.strategic ? "Oui" : "Non",
    strategicAxis: p.strategicAxis?.label ?? null,
    strategicObjective: p.strategicObjective,
    ptbaReference: p.ptbaReference,
    ptbaActivity: p.ptbaActivity,
    budgetPlanned: p.budgetPlanned === null ? null : String(p.budgetPlanned),
    fundingSource: p.fundingSource?.label ?? null,
  };
}

const withRefs = {
  type: true,
  category: true,
  priority: true,
  status: true,
  direction: true,
  pole: true,
  sponsor: true,
  owner: true,
  lead: true,
  strategicAxis: true,
  fundingSource: true,
} as const;

async function checkPoleBelongsToDirection(poleId: string | null, directionId: string | null): Promise<FormState | null> {
  if (!poleId) return null;
  const pole = await db.pole.findUnique({ where: { id: poleId } });
  if (!pole || (directionId && pole.directionId !== directionId)) {
    return { fieldErrors: { poleId: ["Ce pôle n’appartient pas à la direction choisie."] } };
  }
  return null;
}

export async function createProject(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.profile, "projects.create")) return { error: "Vous n’êtes pas autorisé à créer un projet." };

  const parsed = projectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const data = parsed.data;
  const poleError = await checkPoleBelongsToDirection(data.poleId, data.directionId);
  if (poleError) return poleError;

  const project = await db.project.create({
    data: { ...data, code: await nextProjectCode(), createdById: user.id },
    include: withRefs,
  });

  // Le chef de projet et le responsable font partie de l'équipe
  const team: { userId: string; role: ProjectRole }[] = [];
  if (project.leadId) team.push({ userId: project.leadId, role: "CHEF_DE_PROJET" });
  if (project.ownerId && project.ownerId !== project.leadId) {
    team.push({ userId: project.ownerId, role: "RESPONSABLE" });
  }
  if (team.length) {
    await db.projectMember.createMany({ data: team.map((m) => ({ ...m, projectId: project.id })) });
  }

  await audit({
    actor: user,
    action: "CREATE",
    entity: "Projet",
    entityId: project.id,
    entityLabel: `${project.code} — ${project.name}`,
  });
  revalidatePath("/portefeuille");
  redirect(`/projets/${project.id}`);
}

export async function updateProject(projectId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const before = await db.project.findUnique({ where: { id: projectId }, include: { ...withRefs, members: true } });
  if (!before) return { error: "Projet introuvable." };
  if (!canEditProject(user, before)) return { error: "Vous n’êtes pas autorisé à modifier ce projet." };

  const parsed = projectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const data = parsed.data;
  const poleError = await checkPoleBelongsToDirection(data.poleId, data.directionId);
  if (poleError) return poleError;

  const after = await db.project.update({ where: { id: projectId }, data, include: withRefs });

  // Maintien de l'équipe : le chef et le responsable restent membres
  for (const [userId, role] of [
    [after.leadId, "CHEF_DE_PROJET"],
    [after.ownerId, "RESPONSABLE"],
  ] as const) {
    if (!userId) continue;
    await db.projectMember.upsert({
      where: { projectId_userId: { projectId, userId } },
      update: { role },
      create: { projectId, userId, role },
    });
  }

  const count = await auditChanges(
    { actor: user, entity: "Projet", entityId: projectId, entityLabel: `${after.code} — ${after.name}` },
    auditView(before),
    auditView(after),
    FIELD_LABELS,
  );
  revalidatePath("/portefeuille");
  revalidatePath(`/projets/${projectId}`);
  return { success: count ? "Modifications enregistrées." : "Aucune modification." };
}

// ─── Équipe projet ──────────────────────────────────────────────────────────

const memberSchema = z.object({
  userId: z.string().min(1, "Utilisateur requis."),
  role: z.enum(ProjectRole),
  plannedHours: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? Number(v.replace(",", ".")) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0), "Nombre d’heures invalide."),
});

async function requireEditableProject(projectId: string) {
  const user = await requireUser();
  const project = await db.project.findUnique({ where: { id: projectId }, include: { members: true } });
  if (!project) return { error: "Projet introuvable." as const };
  if (!canEditProject(user, project)) return { error: "Vous n’êtes pas autorisé à modifier ce projet." as const };
  return { user, project };
}

export async function saveMember(projectId: string, _: FormState, formData: FormData): Promise<FormState> {
  const context = await requireEditableProject(projectId);
  if ("error" in context) return { error: context.error };
  const parsed = memberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { userId, role, plannedHours } = parsed.data;

  // Écritures et lectures en séquence : l'adaptateur PostgreSQL partage une connexion
  const member = await db.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    update: { role, plannedHours },
    create: { projectId, userId, role, plannedHours },
    include: { user: true },
  });
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });

  await audit({
    actor: context.user,
    action: "UPDATE",
    entity: "Projet",
    entityId: projectId,
    entityLabel: `${project.code} — ${project.name}`,
    field: "Équipe",
    newValue: `${displayName(member.user)} — ${role}`,
  });
  revalidatePath(`/projets/${projectId}/equipe`);
  return { success: `${displayName(member.user)} fait partie de l’équipe.` };
}

export async function removeMember(projectId: string, memberId: string) {
  const context = await requireEditableProject(projectId);
  if ("error" in context) return;
  const member = await db.projectMember.findUnique({ where: { id: memberId }, include: { user: true, project: true } });
  if (!member || member.projectId !== projectId) return;
  // Le chef de projet et le responsable restent dans l'équipe tant qu'ils occupent ce rôle
  if (member.userId === member.project.leadId || member.userId === member.project.ownerId) return;

  await db.projectMember.delete({ where: { id: memberId } });
  await audit({
    actor: context.user,
    action: "UPDATE",
    entity: "Projet",
    entityId: projectId,
    entityLabel: `${member.project.code} — ${member.project.name}`,
    field: "Équipe",
    oldValue: displayName(member.user),
    newValue: "Retiré de l’équipe",
  });
  revalidatePath(`/projets/${projectId}/equipe`);
}

// ─── Rubriques personnalisées ───────────────────────────────────────────────

export async function saveFieldValues(projectId: string, _: FormState, formData: FormData): Promise<FormState> {
  const context = await requireEditableProject(projectId);
  if ("error" in context) return { error: context.error };

  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  const definitions = await db.customFieldDef.findMany({
    where: {
      active: true,
      OR: [{ projectId }, ...(project.typeId ? [{ projectTypeId: project.typeId }] : [])],
    },
  });
  const current = await db.customFieldValue.findMany({ where: { projectId } });
  const previous = new Map(current.map((v) => [v.definitionId, v.value]));

  const errors: Record<string, string[]> = {};
  const updates: { definitionId: string; value: string | null; label: string; before: string | null }[] = [];

  for (const definition of definitions) {
    const raw = definition.fieldType === "MULTISELECT" ? formData.getAll(definition.id).map(String) : formData.get(definition.id);
    const { value, error } = parseFieldValue(definition, raw === null ? null : (raw as string | string[]));
    if (error) {
      errors[definition.id] = [error];
      continue;
    }
    const before = previous.get(definition.id) ?? null;
    if (before !== value) updates.push({ definitionId: definition.id, value, label: definition.label, before });
  }
  if (Object.keys(errors).length) return { fieldErrors: errors };

  for (const update of updates) {
    await db.customFieldValue.upsert({
      where: { definitionId_projectId: { definitionId: update.definitionId, projectId } },
      update: { value: update.value },
      create: { definitionId: update.definitionId, projectId, value: update.value },
    });
    await audit({
      actor: context.user,
      action: "UPDATE",
      entity: "Projet",
      entityId: projectId,
      entityLabel: `${project.code} — ${project.name}`,
      field: update.label,
      oldValue: update.before,
      newValue: update.value,
    });
  }

  revalidatePath(`/projets/${projectId}/champs`);
  return { success: updates.length ? "Rubriques enregistrées." : "Aucune modification." };
}

const definitionSchema = z.object({
  label: z.string().trim().min(1, "Libellé requis."),
  code: z.string().optional(),
  fieldType: z.enum(FieldType),
  options: z.string().optional(),
  unit: optionalText,
  helpText: optionalText,
  required: z
    .string()
    .optional()
    .transform((v) => v === "on"),
  sortOrder: z.coerce.number().int().min(0).max(9999),
});

/** Crée ou modifie une rubrique, soit pour un type de projet, soit pour un projet précis. */
export async function saveFieldDefinition(
  scope: { projectTypeId?: string; projectId?: string },
  definitionId: string | null,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (scope.projectId) {
    const context = await requireEditableProject(scope.projectId);
    if ("error" in context) return { error: context.error };
  } else if (!can(user.profile, "admin.customFields")) {
    return { error: "Vous n’êtes pas autorisé à modifier les rubriques." };
  }

  const parsed = definitionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { label, fieldType, options, unit, helpText, required, sortOrder } = parsed.data;
  const code = suggestFieldCode(parsed.data.code?.trim() || label);
  if (!code) return { error: "Code invalide." };

  const optionList = (options ?? "")
    .split("\n")
    .map((o) => o.trim())
    .filter(Boolean);
  if ((fieldType === "SELECT" || fieldType === "MULTISELECT") && optionList.length === 0) {
    return { error: "Indiquez au moins une valeur possible (une par ligne)." };
  }

  const duplicate = await db.customFieldDef.findFirst({
    where: {
      code,
      projectTypeId: scope.projectTypeId ?? null,
      projectId: scope.projectId ?? null,
      id: definitionId ? { not: definitionId } : undefined,
    },
  });
  if (duplicate) return { error: `Le code « ${code} » existe déjà à cet endroit.` };

  const data = { label, code, fieldType, options: optionList, unit, helpText, required, sortOrder };
  const entity = scope.projectId ? "Rubrique de projet" : "Rubrique de type de projet";

  if (definitionId) {
    const before = await db.customFieldDef.findUniqueOrThrow({ where: { id: definitionId } });
    const after = await db.customFieldDef.update({ where: { id: definitionId }, data });
    await auditChanges(
      { actor: user, entity, entityId: definitionId, entityLabel: after.label },
      { ...before, options: before.options.join(", ") },
      { ...after, options: after.options.join(", ") },
      {
        label: "Libellé",
        code: "Code",
        fieldType: "Type",
        options: "Valeurs possibles",
        unit: "Unité",
        helpText: "Aide",
        required: "Obligatoire",
        sortOrder: "Ordre",
      },
    );
  } else {
    const created = await db.customFieldDef.create({
      data: { ...data, projectTypeId: scope.projectTypeId ?? null, projectId: scope.projectId ?? null },
    });
    await audit({ actor: user, action: "CREATE", entity, entityId: created.id, entityLabel: created.label });
  }

  if (scope.projectId) revalidatePath(`/projets/${scope.projectId}/champs`);
  revalidatePath("/admin/rubriques");
  return { success: definitionId ? "Rubrique mise à jour." : `Rubrique « ${label} » ajoutée.` };
}

export async function toggleFieldDefinition(definitionId: string) {
  const user = await requireUser();
  const definition = await db.customFieldDef.findUniqueOrThrow({ where: { id: definitionId } });
  if (definition.projectId) {
    const context = await requireEditableProject(definition.projectId);
    if ("error" in context) return;
  } else if (!can(user.profile, "admin.customFields")) {
    return;
  }

  await db.customFieldDef.update({ where: { id: definitionId }, data: { active: !definition.active } });
  await audit({
    actor: user,
    action: "UPDATE",
    entity: definition.projectId ? "Rubrique de projet" : "Rubrique de type de projet",
    entityId: definitionId,
    entityLabel: definition.label,
    field: "Statut",
    oldValue: definition.active ? "Active" : "Inactive",
    newValue: definition.active ? "Inactive" : "Active",
  });
  if (definition.projectId) revalidatePath(`/projets/${definition.projectId}/champs`);
  revalidatePath("/admin/rubriques");
}
