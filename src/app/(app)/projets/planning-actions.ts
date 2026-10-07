"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, displayName } from "@/lib/auth/session";
import { canEditProject } from "@/lib/auth/permissions";
import { audit, auditChanges } from "@/lib/audit";
import {
  recomputeProjectProgress,
  rescheduleDependents,
  wouldCreateCycle,
  WORK_ITEM_LABELS,
  allowedChildKinds,
} from "@/lib/planning";
import { DependencyKind, MilestoneStatus, WorkItemKind } from "@/generated/prisma/enums";
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

async function requireEditableProject(projectId: string) {
  const user = await requireUser();
  const project = await db.project.findUnique({ where: { id: projectId }, include: { members: true } });
  if (!project) return { error: "Projet introuvable." as const };
  if (!canEditProject(user, project)) return { error: "Vous n’êtes pas autorisé à modifier ce projet." as const };
  return { user, project };
}

// ─── Éléments de planning ───────────────────────────────────────────────────

const workItemSchema = z
  .object({
    kind: z.enum(WorkItemKind),
    parentId: optionalId,
    name: z.string().trim().min(2, "Intitulé requis."),
    description: optionalText,
    ownerId: optionalId,
    statusId: optionalId,
    priorityId: optionalId,
    startDate: optionalDate,
    endDate: optionalDate,
    progress: z.coerce.number().min(0, "Avancement invalide.").max(100, "Avancement invalide."),
    plannedHours: z
      .string()
      .optional()
      .transform((v) => (v?.trim() ? Number(v.replace(",", ".")) : null))
      .refine((v) => v === null || (Number.isFinite(v) && v >= 0), "Nombre d’heures invalide."),
    sortOrder: z.coerce.number().int().min(0).max(9999),
    assignees: z.string().optional(),
  })
  .refine((d) => !d.startDate || !d.endDate || d.endDate >= d.startDate, {
    path: ["endDate"],
    message: "La date de fin doit suivre la date de début.",
  });

const ITEM_LABELS = {
  name: "Intitulé",
  description: "Description",
  kind: "Niveau",
  owner: "Responsable",
  status: "Statut",
  priority: "Priorité",
  startDate: "Date de début",
  endDate: "Date de fin",
  progress: "Avancement (%)",
  plannedHours: "Temps prévu (h)",
  parent: "Rattachement",
};

const asDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

const itemView = (item: {
  name: string;
  description: string | null;
  kind: WorkItemKind;
  owner: { firstName: string; lastName: string } | null;
  status: { label: string } | null;
  priority: { label: string } | null;
  startDate: Date | null;
  endDate: Date | null;
  progress: unknown;
  plannedHours: unknown;
  parent?: { name: string } | null;
}) => ({
  name: item.name,
  description: item.description,
  kind: WORK_ITEM_LABELS[item.kind],
  owner: item.owner ? `${item.owner.firstName} ${item.owner.lastName}` : null,
  status: item.status?.label ?? null,
  priority: item.priority?.label ?? null,
  startDate: asDate(item.startDate),
  endDate: asDate(item.endDate),
  progress: String(item.progress),
  plannedHours: item.plannedHours === null ? null : String(item.plannedHours),
  parent: item.parent?.name ?? null,
});

const itemInclude = { owner: true, status: true, priority: true, parent: true } as const;

export async function saveWorkItem(
  projectId: string,
  itemId: string | null,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireEditableProject(projectId);
  if ("error" in context) return { error: context.error };

  const parsed = workItemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { assignees, ...data } = parsed.data;

  if (data.parentId) {
    const parent = await db.workItem.findUnique({ where: { id: data.parentId } });
    if (!parent || parent.projectId !== projectId) return { error: "Rattachement invalide." };
    if (parent.id === itemId) return { error: "Un élément ne peut pas être rattaché à lui-même." };
    if (!allowedChildKinds(parent.kind).includes(data.kind)) {
      return {
        error: `Un élément « ${WORK_ITEM_LABELS[data.kind]} » ne peut pas être placé sous « ${WORK_ITEM_LABELS[parent.kind]} ».`,
      };
    }
  } else if (!allowedChildKinds(null).includes(data.kind)) {
    return { error: `Un élément « ${WORK_ITEM_LABELS[data.kind]} » doit être rattaché à un niveau supérieur.` };
  }

  const assigneeIds = (assignees ?? "").split(",").map((v) => v.trim()).filter(Boolean);

  if (itemId) {
    const before = await db.workItem.findUnique({ where: { id: itemId }, include: itemInclude });
    if (!before || before.projectId !== projectId) return { error: "Élément introuvable." };
    const after = await db.workItem.update({ where: { id: itemId }, data, include: itemInclude });
    await db.workItemAssignee.deleteMany({ where: { workItemId: itemId, userId: { notIn: assigneeIds } } });
    for (const userId of assigneeIds) {
      await db.workItemAssignee.upsert({
        where: { workItemId_userId: { workItemId: itemId, userId } },
        update: {},
        create: { workItemId: itemId, userId },
      });
    }
    await auditChanges(
      { actor: context.user, entity: "Planning", entityId: itemId, entityLabel: after.name },
      itemView(before),
      itemView(after),
      ITEM_LABELS,
    );
  } else {
    const created = await db.workItem.create({ data: { ...data, projectId } });
    for (const userId of assigneeIds) {
      await db.workItemAssignee.create({ data: { workItemId: created.id, userId } });
    }
    await audit({
      actor: context.user,
      action: "CREATE",
      entity: "Planning",
      entityId: created.id,
      entityLabel: `${WORK_ITEM_LABELS[created.kind]} — ${created.name}`,
    });
  }

  await recomputeProjectProgress(projectId);
  revalidatePath(`/projets/${projectId}/planification`);
  revalidatePath(`/projets/${projectId}`);
  return { success: itemId ? "Élément mis à jour." : "Élément ajouté au planning." };
}

export async function deleteWorkItem(projectId: string, itemId: string) {
  const context = await requireEditableProject(projectId);
  if ("error" in context) return;
  const item = await db.workItem.findUnique({ where: { id: itemId }, include: { children: true } });
  if (!item || item.projectId !== projectId) return;

  await db.workItem.delete({ where: { id: itemId } });
  await audit({
    actor: context.user,
    action: "DELETE",
    entity: "Planning",
    entityId: itemId,
    entityLabel: `${WORK_ITEM_LABELS[item.kind]} — ${item.name}`,
    oldValue: item.children.length ? `${item.children.length} élément(s) rattaché(s) supprimé(s)` : null,
  });
  await recomputeProjectProgress(projectId);
  revalidatePath(`/projets/${projectId}/planification`);
}

/** Mise à jour rapide de l'avancement depuis la liste. */
export async function setWorkItemProgress(projectId: string, itemId: string, formData: FormData) {
  const context = await requireEditableProject(projectId);
  if ("error" in context) return;
  const progress = Math.max(0, Math.min(100, Number(formData.get("progress") ?? 0)));
  const before = await db.workItem.findUnique({ where: { id: itemId } });
  if (!before || before.projectId !== projectId) return;

  await db.workItem.update({ where: { id: itemId }, data: { progress } });
  await audit({
    actor: context.user,
    action: "UPDATE",
    entity: "Planning",
    entityId: itemId,
    entityLabel: before.name,
    field: "Avancement (%)",
    oldValue: String(before.progress),
    newValue: String(progress),
  });
  await recomputeProjectProgress(projectId);
  revalidatePath(`/projets/${projectId}/planification`);
  revalidatePath(`/projets/${projectId}`);
}

// ─── Dépendances ────────────────────────────────────────────────────────────

export async function addDependency(projectId: string, itemId: string, _: FormState, formData: FormData): Promise<FormState> {
  const context = await requireEditableProject(projectId);
  if ("error" in context) return { error: context.error };

  const parsed = z
    .object({
      dependsOnId: z.string().min(1, "Élément précédent requis."),
      kind: z.enum(DependencyKind),
      lagDays: z.coerce.number().int().min(-365).max(365),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { dependsOnId, kind, lagDays } = parsed.data;

  const [item, dependsOn] = [
    await db.workItem.findUnique({ where: { id: itemId } }),
    await db.workItem.findUnique({ where: { id: dependsOnId } }),
  ];
  if (!item || !dependsOn || item.projectId !== projectId || dependsOn.projectId !== projectId) {
    return { error: "Élément introuvable." };
  }
  if (await wouldCreateCycle(itemId, dependsOnId)) return { error: "Ce lien créerait une boucle de dépendances." };

  await db.workItemDependency.upsert({
    where: { itemId_dependsOnId: { itemId, dependsOnId } },
    update: { kind, lagDays },
    create: { itemId, dependsOnId, kind, lagDays },
  });
  await audit({
    actor: context.user,
    action: "UPDATE",
    entity: "Planning",
    entityId: itemId,
    entityLabel: item.name,
    field: "Dépendance",
    newValue: `après « ${dependsOn.name} »`,
  });
  revalidatePath(`/projets/${projectId}/planification`);
  return { success: "Dépendance enregistrée." };
}

export async function removeDependency(projectId: string, dependencyId: string) {
  const context = await requireEditableProject(projectId);
  if ("error" in context) return;
  const link = await db.workItemDependency.findUnique({
    where: { id: dependencyId },
    include: { item: true, dependsOn: true },
  });
  if (!link || link.item.projectId !== projectId) return;

  await db.workItemDependency.delete({ where: { id: dependencyId } });
  await audit({
    actor: context.user,
    action: "UPDATE",
    entity: "Planning",
    entityId: link.itemId,
    entityLabel: link.item.name,
    field: "Dépendance",
    oldValue: `après « ${link.dependsOn.name} »`,
    newValue: "supprimée",
  });
  revalidatePath(`/projets/${projectId}/planification`);
}

/** Décale les éléments dépendants pour respecter les liens. */
export async function replanProject(projectId: string) {
  const context = await requireEditableProject(projectId);
  if ("error" in context) return;
  const moved = await rescheduleDependents(projectId);
  if (moved > 0) {
    const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
    await audit({
      actor: context.user,
      action: "UPDATE",
      entity: "Projet",
      entityId: projectId,
      entityLabel: `${project.code} — ${project.name}`,
      field: "Planning",
      newValue: `${moved} élément(s) replanifié(s) selon les dépendances`,
    });
  }
  revalidatePath(`/projets/${projectId}/planification`);
}

// ─── Jalons ─────────────────────────────────────────────────────────────────

const milestoneSchema = z.object({
  name: z.string().trim().min(2, "Nom du jalon requis."),
  description: optionalText,
  dueDate: z
    .string()
    .min(1, "Date prévue requise.")
    .transform((v) => new Date(v))
    .refine((v) => !Number.isNaN(v.getTime()), "Date invalide."),
  actualDate: optionalDate,
  status: z.enum(MilestoneStatus),
  ownerId: optionalId,
  criticalityId: optionalId,
  workItemId: optionalId,
});

const MILESTONE_LABELS = {
  name: "Nom du jalon",
  description: "Description",
  dueDate: "Date prévue",
  actualDate: "Date réelle",
  status: "Statut",
  owner: "Responsable",
  criticality: "Criticité",
  workItem: "Élément de planning associé",
};

const milestoneView = (m: {
  name: string;
  description: string | null;
  dueDate: Date;
  actualDate: Date | null;
  status: MilestoneStatus;
  owner: { firstName: string; lastName: string } | null;
  criticality: { label: string } | null;
  workItem: { name: string } | null;
}) => ({
  name: m.name,
  description: m.description,
  dueDate: asDate(m.dueDate),
  actualDate: asDate(m.actualDate),
  status: m.status,
  owner: m.owner ? displayName(m.owner) : null,
  criticality: m.criticality?.label ?? null,
  workItem: m.workItem?.name ?? null,
});

const milestoneInclude = { owner: true, criticality: true, workItem: true } as const;

export async function saveMilestone(
  projectId: string,
  milestoneId: string | null,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireEditableProject(projectId);
  if ("error" in context) return { error: context.error };

  const parsed = milestoneSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const data = parsed.data;
  if (data.status === "ATTEINT" && !data.actualDate) {
    return { fieldErrors: { actualDate: ["Indiquez la date réelle d’atteinte du jalon."] } };
  }

  if (milestoneId) {
    const before = await db.milestone.findUnique({ where: { id: milestoneId }, include: milestoneInclude });
    if (!before || before.projectId !== projectId) return { error: "Jalon introuvable." };
    const after = await db.milestone.update({ where: { id: milestoneId }, data, include: milestoneInclude });
    await auditChanges(
      { actor: context.user, entity: "Jalon", entityId: milestoneId, entityLabel: after.name },
      milestoneView(before),
      milestoneView(after),
      MILESTONE_LABELS,
    );
  } else {
    const created = await db.milestone.create({ data: { ...data, projectId } });
    await audit({
      actor: context.user,
      action: "CREATE",
      entity: "Jalon",
      entityId: created.id,
      entityLabel: created.name,
    });
  }

  revalidatePath(`/projets/${projectId}/jalons`);
  revalidatePath(`/projets/${projectId}`);
  return { success: milestoneId ? "Jalon mis à jour." : "Jalon ajouté." };
}

export async function deleteMilestone(projectId: string, milestoneId: string) {
  const context = await requireEditableProject(projectId);
  if ("error" in context) return;
  const milestone = await db.milestone.findUnique({ where: { id: milestoneId } });
  if (!milestone || milestone.projectId !== projectId) return;

  await db.milestone.delete({ where: { id: milestoneId } });
  await audit({
    actor: context.user,
    action: "DELETE",
    entity: "Jalon",
    entityId: milestoneId,
    entityLabel: milestone.name,
  });
  revalidatePath(`/projets/${projectId}/jalons`);
}
