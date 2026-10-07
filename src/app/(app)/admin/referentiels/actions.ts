"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { audit, auditChanges } from "@/lib/audit";
import { refKindLabel } from "@/lib/referentiels";
import { RefKind } from "@/generated/prisma/enums";
import type { FormState } from "@/components/ui";

const schema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Code requis.")
    .max(30, "Code trop long.")
    .transform((v) => v.toUpperCase().replace(/\s+/g, "_")),
  label: z.string().trim().min(1, "Libellé requis."),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  isDefault: z
    .string()
    .optional()
    .transform((v) => v === "on"),
});

export async function saveRefItem(
  kind: RefKind,
  id: string | null,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission("admin.referentiels");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = { ...parsed.data, color: parsed.data.color ?? null };

  const duplicate = await db.refItem.findUnique({ where: { kind_code: { kind, code: data.code } } });
  if (duplicate && duplicate.id !== id) return { error: `Le code « ${data.code} » existe déjà dans cette liste.` };

  // Une seule valeur par défaut par liste
  if (data.isDefault) {
    await db.refItem.updateMany({ where: { kind, isDefault: true, id: id ? { not: id } : undefined }, data: { isDefault: false } });
  }

  const entity = `Référentiel · ${refKindLabel(kind)}`;
  if (id) {
    const before = await db.refItem.findUniqueOrThrow({ where: { id } });
    const after = await db.refItem.update({ where: { id }, data });
    await auditChanges({ actor, entity, entityId: id, entityLabel: after.label }, before, after, {
      code: "Code",
      label: "Libellé",
      color: "Couleur",
      sortOrder: "Ordre",
      isDefault: "Valeur par défaut",
    });
  } else {
    const created = await db.refItem.create({ data: { ...data, kind } });
    await audit({ actor, action: "CREATE", entity, entityId: created.id, entityLabel: created.label });
  }
  revalidatePath("/admin/referentiels");
  return { success: id ? "Valeur mise à jour." : `« ${data.label} » ajouté.` };
}

export async function toggleRefItem(id: string) {
  const actor = await requirePermission("admin.referentiels");
  const item = await db.refItem.findUniqueOrThrow({ where: { id } });
  await db.refItem.update({ where: { id }, data: { active: !item.active } });
  await audit({
    actor,
    action: "UPDATE",
    entity: `Référentiel · ${refKindLabel(item.kind)}`,
    entityId: id,
    entityLabel: item.label,
    field: "Statut",
    oldValue: item.active ? "Actif" : "Inactif",
    newValue: item.active ? "Inactif" : "Actif",
  });
  revalidatePath("/admin/referentiels");
}
