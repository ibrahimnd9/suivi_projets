"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, displayName } from "@/lib/auth/session";
import { canEditProject } from "@/lib/auth/permissions";
import { audit } from "@/lib/audit";
import { RaciRole } from "@/generated/prisma/enums";

const isRole = (value: string): value is RaciRole => ["R", "A", "C", "I"].includes(value);

/** Affecte (ou retire) un rôle RACI à une personne sur un élément de planning. */
export async function setRaci(projectId: string, workItemId: string, userId: string, role: string) {
  const user = await requireUser();
  const project = await db.project.findUnique({ where: { id: projectId }, include: { members: true } });
  if (!project || !canEditProject(user, project)) return;

  const item = await db.workItem.findUnique({ where: { id: workItemId } });
  if (!item || item.projectId !== projectId) return;
  if (!project.members.some((m) => m.userId === userId)) return;

  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return;
  const previous = await db.workItem
    .findUnique({ where: { id: workItemId } })
    .raci({ where: { userId } })
    .then((rows) => rows?.[0] ?? null);

  if (!isRole(role)) {
    await db.raciAssignment.deleteMany({ where: { workItemId, userId } });
  } else {
    // Un seul « A » par élément
    if (role === "A") {
      await db.raciAssignment.deleteMany({ where: { workItemId, role: "A", userId: { not: userId } } });
    }
    await db.raciAssignment.upsert({
      where: { workItemId_userId: { workItemId, userId } },
      update: { role },
      create: { workItemId, userId, role },
    });
  }

  await audit({
    actor: user,
    action: "UPDATE",
    entity: "RACI",
    entityId: workItemId,
    entityLabel: item.name,
    field: displayName(target),
    oldValue: previous?.role ?? null,
    newValue: isRole(role) ? role : null,
  });
  revalidatePath(`/projets/${projectId}/raci`);
}
