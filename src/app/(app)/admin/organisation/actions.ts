"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { audit, auditChanges } from "@/lib/audit";
import type { FormState } from "@/components/ui";

const code = z
  .string()
  .trim()
  .min(1, "Code requis.")
  .max(20, "Code trop long (20 caractères maximum).")
  .transform((v) => v.toUpperCase());
const name = z.string().trim().min(1, "Libellé requis.");

const directionSchema = z.object({ code, name });
const poleSchema = z.object({ code, name, directionId: z.string().min(1, "Direction requise.") });

function firstError(error: z.ZodError): FormState {
  return { error: error.issues[0].message };
}

export async function saveDirection(id: string | null, _: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("admin.organisation");
  const parsed = directionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return firstError(parsed.error);
  const data = parsed.data;

  const duplicate = await db.direction.findUnique({ where: { code: data.code } });
  if (duplicate && duplicate.id !== id) return { error: `Le code « ${data.code} » est déjà utilisé.` };

  if (id) {
    const before = await db.direction.findUniqueOrThrow({ where: { id } });
    const after = await db.direction.update({ where: { id }, data });
    await auditChanges({ actor, entity: "Direction", entityId: id, entityLabel: after.name }, before, after, {
      code: "Code",
      name: "Libellé",
    });
    revalidatePath("/admin/organisation");
    return { success: "Direction mise à jour." };
  }

  const created = await db.direction.create({ data });
  await audit({ actor, action: "CREATE", entity: "Direction", entityId: created.id, entityLabel: created.name });
  revalidatePath("/admin/organisation");
  return { success: `Direction « ${created.name} » créée.` };
}

export async function savePole(id: string | null, _: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("admin.organisation");
  const parsed = poleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return firstError(parsed.error);
  const data = parsed.data;

  const duplicate = await db.pole.findUnique({ where: { code: data.code } });
  if (duplicate && duplicate.id !== id) return { error: `Le code « ${data.code} » est déjà utilisé.` };

  if (id) {
    const before = await db.pole.findUniqueOrThrow({ where: { id }, include: { direction: true } });
    const after = await db.pole.update({ where: { id }, data, include: { direction: true } });
    await auditChanges(
      { actor, entity: "Pôle", entityId: id, entityLabel: after.name },
      { code: before.code, name: before.name, direction: before.direction.name },
      { code: after.code, name: after.name, direction: after.direction.name },
      { code: "Code", name: "Libellé", direction: "Direction" },
    );
    // Les utilisateurs du pôle suivent sa nouvelle direction
    if (before.directionId !== after.directionId) {
      await db.user.updateMany({ where: { poleId: id }, data: { directionId: after.directionId } });
    }
    revalidatePath("/admin/organisation");
    return { success: "Pôle mis à jour." };
  }

  const created = await db.pole.create({ data });
  await audit({ actor, action: "CREATE", entity: "Pôle", entityId: created.id, entityLabel: created.name });
  revalidatePath("/admin/organisation");
  return { success: `Pôle « ${created.name} » créé.` };
}

export async function toggleOrgUnit(kind: "direction" | "pole", id: string) {
  const actor = await requirePermission("admin.organisation");
  const current =
    kind === "direction"
      ? await db.direction.findUniqueOrThrow({ where: { id } })
      : await db.pole.findUniqueOrThrow({ where: { id } });
  const active = !current.active;
  if (kind === "direction") await db.direction.update({ where: { id }, data: { active } });
  else await db.pole.update({ where: { id }, data: { active } });

  await audit({
    actor,
    action: "UPDATE",
    entity: kind === "direction" ? "Direction" : "Pôle",
    entityId: id,
    entityLabel: current.name,
    field: "Statut",
    oldValue: current.active ? "Actif" : "Inactif",
    newValue: active ? "Actif" : "Inactif",
  });
  revalidatePath("/admin/organisation");
}
