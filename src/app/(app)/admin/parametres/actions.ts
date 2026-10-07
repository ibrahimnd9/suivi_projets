"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { getAlertSettings, getHealthWeights, saveSetting, WEIGHT_LABELS } from "@/lib/settings";
import type { FormState } from "@/components/ui";

const weightsSchema = z.object({
  planning: z.coerce.number().min(0).max(100),
  budget: z.coerce.number().min(0).max(100),
  progress: z.coerce.number().min(0).max(100),
  risks: z.coerce.number().min(0).max(100),
  kpi: z.coerce.number().min(0).max(100),
  resources: z.coerce.number().min(0).max(100),
});

export async function saveHealthWeights(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("admin.referentiels");
  const parsed = weightsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const total = Object.values(parsed.data).reduce((sum, value) => sum + value, 0);
  if (total !== 100) return { error: `Le total des pondérations doit faire 100 % (actuellement ${total} %).` };

  const before = await getHealthWeights();
  await saveSetting("healthWeights", parsed.data);
  for (const key of Object.keys(WEIGHT_LABELS) as (keyof typeof WEIGHT_LABELS)[]) {
    if (before[key] !== parsed.data[key]) {
      await audit({
        actor: user,
        action: "UPDATE",
        entity: "Paramètres",
        entityLabel: "Score de santé",
        field: WEIGHT_LABELS[key],
        oldValue: String(before[key]),
        newValue: String(parsed.data[key]),
      });
    }
  }
  revalidatePath("/admin/parametres");
  revalidatePath("/tableau-de-bord");
  return { success: "Pondérations enregistrées." };
}

const alertsSchema = z
  .object({
    dueSoonDays: z.coerce.number().int().min(1).max(60),
    budgetThreshold: z.coerce.number().min(1).max(200),
    greenFrom: z.coerce.number().min(1).max(100),
    redBelow: z.coerce.number().min(0).max(99),
  })
  .refine((d) => d.redBelow < d.greenFrom, {
    message: "Le seuil rouge doit être inférieur au seuil vert.",
  });

export async function saveAlertSettings(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("admin.referentiels");
  const parsed = alertsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const before = await getAlertSettings();
  await saveSetting("alertSettings", parsed.data);
  const labels = {
    dueSoonDays: "Délai de prévenance (jours)",
    budgetThreshold: "Seuil d’alerte budget (%)",
    greenFrom: "Score vert à partir de",
    redBelow: "Score rouge en dessous de",
  } as const;
  for (const key of Object.keys(labels) as (keyof typeof labels)[]) {
    if (before[key] !== parsed.data[key]) {
      await audit({
        actor: user,
        action: "UPDATE",
        entity: "Paramètres",
        entityLabel: "Seuils d’alerte",
        field: labels[key],
        oldValue: String(before[key]),
        newValue: String(parsed.data[key]),
      });
    }
  }
  revalidatePath("/admin/parametres");
  revalidatePath("/tableau-de-bord");
  return { success: "Seuils enregistrés." };
}
