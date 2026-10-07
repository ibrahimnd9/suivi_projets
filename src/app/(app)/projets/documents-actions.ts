"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, displayName } from "@/lib/auth/session";
import { canEditProject } from "@/lib/auth/permissions";
import { audit, auditChanges } from "@/lib/audit";
import { deleteStoredFile, fileTypeError, safeFileName, storeFile } from "@/lib/storage";
import { DecisionStatus, DeliverableStatus } from "@/generated/prisma/enums";
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

async function requireEditableProject(projectId: string) {
  const user = await requireUser();
  const project = await db.project.findUnique({ where: { id: projectId }, include: { members: true } });
  if (!project) return { error: "Projet introuvable." as const };
  if (!canEditProject(user, project)) return { error: "Vous n’êtes pas autorisé à modifier ce projet." as const };
  return { user, project };
}

const asDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

// ─── Documents ──────────────────────────────────────────────────────────────

/** Dépose un document, éventuellement comme nouvelle version d'un document existant. */
export async function uploadDocument(projectId: string, _: FormState, formData: FormData): Promise<FormState> {
  const context = await requireEditableProject(projectId);
  if ("error" in context) return { error: context.error };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Aucun fichier sélectionné." };
  const typeError = fileTypeError(file);
  if (typeError) return { error: typeError };

  const parsed = z
    .object({
      title: z.string().trim().min(2, "Titre requis."),
      description: optionalText,
      categoryId: optionalId,
      replacesId: optionalId,
    })
    .safeParse({
      title: formData.get("title") ?? "",
      description: formData.get("description") ?? undefined,
      categoryId: formData.get("categoryId") ?? undefined,
      replacesId: formData.get("replacesId") ?? undefined,
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { title, description, categoryId, replacesId } = parsed.data;

  let version = 1;
  if (replacesId) {
    const previous = await db.document.findUnique({ where: { id: replacesId }, include: { next: true } });
    if (!previous || previous.projectId !== projectId) return { error: "Document à remplacer introuvable." };
    if (previous.next) return { error: "Ce document a déjà une version plus récente." };
    version = previous.version + 1;
  }

  const storageKey = await storeFile(projectId, file);
  const document = await db.document.create({
    data: {
      projectId,
      title,
      description,
      categoryId,
      fileName: safeFileName(file.name),
      mimeType: file.type,
      size: file.size,
      storageKey,
      version,
      previousId: replacesId,
      uploadedById: context.user.id,
    },
  });

  await audit({
    actor: context.user,
    action: "CREATE",
    entity: "Document",
    entityId: document.id,
    entityLabel: `${document.title} (v${version})`,
    newValue: document.fileName,
  });
  revalidatePath(`/projets/${projectId}/documents`);
  return { success: `Document « ${title} » déposé (version ${version}).` };
}

export async function updateDocument(projectId: string, documentId: string, _: FormState, formData: FormData): Promise<FormState> {
  const context = await requireEditableProject(projectId);
  if ("error" in context) return { error: context.error };
  const parsed = z
    .object({ title: z.string().trim().min(2, "Titre requis."), description: optionalText, categoryId: optionalId })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const before = await db.document.findUnique({ where: { id: documentId }, include: { category: true } });
  if (!before || before.projectId !== projectId) return { error: "Document introuvable." };
  const after = await db.document.update({ where: { id: documentId }, data: parsed.data, include: { category: true } });
  await auditChanges(
    { actor: context.user, entity: "Document", entityId: documentId, entityLabel: after.title },
    { title: before.title, description: before.description, category: before.category?.label ?? null },
    { title: after.title, description: after.description, category: after.category?.label ?? null },
    { title: "Titre", description: "Description", category: "Catégorie" },
  );
  revalidatePath(`/projets/${projectId}/documents`);
  return { success: "Document mis à jour." };
}

export async function deleteDocument(projectId: string, documentId: string) {
  const context = await requireEditableProject(projectId);
  if ("error" in context) return;
  const document = await db.document.findUnique({ where: { id: documentId } });
  if (!document || document.projectId !== projectId) return;

  await db.document.delete({ where: { id: documentId } });
  await deleteStoredFile(document.storageKey);
  await audit({
    actor: context.user,
    action: "DELETE",
    entity: "Document",
    entityId: documentId,
    entityLabel: `${document.title} (v${document.version})`,
    oldValue: document.fileName,
  });
  revalidatePath(`/projets/${projectId}/documents`);
}

// ─── Livrables ──────────────────────────────────────────────────────────────

const deliverableSchema = z.object({
  name: z.string().trim().min(2, "Nom du livrable requis."),
  description: optionalText,
  ownerId: optionalId,
  dueDate: optionalDate,
  actualDate: optionalDate,
  status: z.enum(DeliverableStatus),
  version: optionalText,
  workItemId: optionalId,
  documentId: optionalId,
});

const DELIVERABLE_LABELS = {
  name: "Livrable",
  description: "Description",
  owner: "Responsable",
  dueDate: "Date prévue",
  actualDate: "Date réelle",
  status: "Statut",
  version: "Version",
  workItem: "Élément de planning",
  document: "Document associé",
};

const deliverableInclude = { owner: true, workItem: true, document: true } as const;

const deliverableView = (d: {
  name: string;
  description: string | null;
  owner: { firstName: string; lastName: string } | null;
  dueDate: Date | null;
  actualDate: Date | null;
  status: DeliverableStatus;
  version: string | null;
  workItem: { name: string } | null;
  document: { title: string } | null;
}) => ({
  name: d.name,
  description: d.description,
  owner: d.owner ? displayName(d.owner) : null,
  dueDate: asDate(d.dueDate),
  actualDate: asDate(d.actualDate),
  status: d.status,
  version: d.version,
  workItem: d.workItem?.name ?? null,
  document: d.document?.title ?? null,
});

export async function saveDeliverable(
  projectId: string,
  deliverableId: string | null,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireEditableProject(projectId);
  if ("error" in context) return { error: context.error };
  const parsed = deliverableSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const data = parsed.data;

  if ((data.status === "LIVRE" || data.status === "VALIDE") && !data.actualDate) data.actualDate = new Date();
  if (data.documentId) {
    const taken = await db.deliverable.findFirst({
      where: { documentId: data.documentId, id: deliverableId ? { not: deliverableId } : undefined },
    });
    if (taken) return { error: "Ce document est déjà rattaché à un autre livrable." };
  }

  if (deliverableId) {
    const before = await db.deliverable.findUnique({ where: { id: deliverableId }, include: deliverableInclude });
    if (!before || before.projectId !== projectId) return { error: "Livrable introuvable." };
    const after = await db.deliverable.update({ where: { id: deliverableId }, data, include: deliverableInclude });
    await auditChanges(
      { actor: context.user, entity: "Livrable", entityId: deliverableId, entityLabel: after.name },
      deliverableView(before),
      deliverableView(after),
      DELIVERABLE_LABELS,
    );
  } else {
    const created = await db.deliverable.create({ data: { ...data, projectId } });
    await audit({ actor: context.user, action: "CREATE", entity: "Livrable", entityId: created.id, entityLabel: created.name });
  }
  revalidatePath(`/projets/${projectId}/livrables`);
  return { success: deliverableId ? "Livrable mis à jour." : "Livrable ajouté." };
}

export async function deleteDeliverable(projectId: string, deliverableId: string) {
  const context = await requireEditableProject(projectId);
  if ("error" in context) return;
  const deliverable = await db.deliverable.findUnique({ where: { id: deliverableId } });
  if (!deliverable || deliverable.projectId !== projectId) return;
  await db.deliverable.delete({ where: { id: deliverableId } });
  await audit({ actor: context.user, action: "DELETE", entity: "Livrable", entityId: deliverableId, entityLabel: deliverable.name });
  revalidatePath(`/projets/${projectId}/livrables`);
}

// ─── Réunions ───────────────────────────────────────────────────────────────

const meetingSchema = z.object({
  date: z
    .string()
    .min(1, "Date requise.")
    .transform((v) => new Date(v))
    .refine((v) => !Number.isNaN(v.getTime()), "Date invalide."),
  typeId: optionalId,
  subject: z.string().trim().min(2, "Objet de la réunion requis."),
  location: optionalText,
  minutes: optionalText,
  participants: z.string().optional(),
});

export async function saveMeeting(
  projectId: string,
  meetingId: string | null,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireEditableProject(projectId);
  if ("error" in context) return { error: context.error };
  const parsed = meetingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { participants, ...data } = parsed.data;
  const participantIds = (participants ?? "").split(",").map((v) => v.trim()).filter(Boolean);

  const meeting = meetingId
    ? await db.meeting.update({ where: { id: meetingId }, data })
    : await db.meeting.create({ data: { ...data, projectId, createdById: context.user.id } });

  await db.meetingParticipant.deleteMany({ where: { meetingId: meeting.id, userId: { notIn: participantIds } } });
  for (const userId of participantIds) {
    await db.meetingParticipant.upsert({
      where: { meetingId_userId: { meetingId: meeting.id, userId } },
      update: {},
      create: { meetingId: meeting.id, userId },
    });
  }

  await audit({
    actor: context.user,
    action: meetingId ? "UPDATE" : "CREATE",
    entity: "Réunion",
    entityId: meeting.id,
    entityLabel: `${meeting.subject} — ${meeting.date.toISOString().slice(0, 10)}`,
    field: meetingId ? "Compte rendu" : null,
    newValue: meetingId ? `${participantIds.length} participant(s)` : null,
  });
  revalidatePath(`/projets/${projectId}/reunions`);
  return { success: meetingId ? "Réunion mise à jour." : "Réunion enregistrée." };
}

export async function deleteMeeting(projectId: string, meetingId: string) {
  const context = await requireEditableProject(projectId);
  if ("error" in context) return;
  const meeting = await db.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting || meeting.projectId !== projectId) return;
  await db.meeting.delete({ where: { id: meetingId } });
  await audit({ actor: context.user, action: "DELETE", entity: "Réunion", entityId: meetingId, entityLabel: meeting.subject });
  revalidatePath(`/projets/${projectId}/reunions`);
}

// ─── Décisions ──────────────────────────────────────────────────────────────

const decisionSchema = z.object({
  title: z.string().trim().min(2, "Intitulé de la décision requis."),
  description: optionalText,
  decidedAt: z
    .string()
    .min(1, "Date requise.")
    .transform((v) => new Date(`${v}T00:00:00Z`))
    .refine((v) => !Number.isNaN(v.getTime()), "Date invalide."),
  decidedById: optionalId,
  meetingId: optionalId,
  status: z.enum(DecisionStatus),
});

export async function saveDecision(
  projectId: string,
  decisionId: string | null,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireEditableProject(projectId);
  if ("error" in context) return { error: context.error };
  const parsed = decisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const data = parsed.data;

  if (decisionId) {
    const before = await db.decision.findUnique({ where: { id: decisionId }, include: { decidedBy: true, meeting: true } });
    if (!before || before.projectId !== projectId) return { error: "Décision introuvable." };
    const after = await db.decision.update({ where: { id: decisionId }, data, include: { decidedBy: true, meeting: true } });
    await auditChanges(
      { actor: context.user, entity: "Décision", entityId: decisionId, entityLabel: after.title },
      {
        title: before.title,
        description: before.description,
        decidedAt: asDate(before.decidedAt),
        status: before.status,
        decidedBy: before.decidedBy ? displayName(before.decidedBy) : null,
        meeting: before.meeting?.subject ?? null,
      },
      {
        title: after.title,
        description: after.description,
        decidedAt: asDate(after.decidedAt),
        status: after.status,
        decidedBy: after.decidedBy ? displayName(after.decidedBy) : null,
        meeting: after.meeting?.subject ?? null,
      },
      {
        title: "Décision",
        description: "Description",
        decidedAt: "Date",
        status: "Statut",
        decidedBy: "Décidée par",
        meeting: "Réunion",
      },
    );
  } else {
    const created = await db.decision.create({ data: { ...data, projectId } });
    await audit({ actor: context.user, action: "CREATE", entity: "Décision", entityId: created.id, entityLabel: created.title });
  }
  revalidatePath(`/projets/${projectId}/reunions`);
  return { success: decisionId ? "Décision mise à jour." : "Décision enregistrée." };
}

export async function deleteDecision(projectId: string, decisionId: string) {
  const context = await requireEditableProject(projectId);
  if ("error" in context) return;
  const decision = await db.decision.findUnique({ where: { id: decisionId } });
  if (!decision || decision.projectId !== projectId) return;
  await db.decision.delete({ where: { id: decisionId } });
  await audit({ actor: context.user, action: "DELETE", entity: "Décision", entityId: decisionId, entityLabel: decision.title });
  revalidatePath(`/projets/${projectId}/reunions`);
}
