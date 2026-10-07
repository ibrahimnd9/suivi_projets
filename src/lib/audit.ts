import "server-only";
import { db } from "@/lib/db";
import { requestMeta, displayName } from "@/lib/auth/session";

type Actor = { id: string; firstName: string; lastName: string } | null;

type AuditInput = {
  actor: Actor;
  action: string;
  entity: string;
  entityId?: string | null;
  entityLabel?: string | null;
  field?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
};

function toText(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export async function audit(input: AuditInput) {
  const { ipAddress } = await requestMeta();
  await db.auditLog.create({
    data: {
      userId: input.actor?.id ?? null,
      userName: input.actor ? displayName(input.actor) : null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      entityLabel: input.entityLabel ?? null,
      field: input.field ?? null,
      oldValue: toText(input.oldValue),
      newValue: toText(input.newValue),
      ipAddress,
    },
  });
}

/**
 * Historise champ par champ les différences entre l'état avant et après.
 * `labels` donne le libellé lisible de chaque champ suivi (les autres sont ignorés).
 */
export async function auditChanges<T extends Record<string, unknown>>(
  base: Omit<AuditInput, "action" | "field" | "oldValue" | "newValue">,
  before: T,
  after: Partial<T>,
  labels: Partial<Record<keyof T, string>>,
) {
  const rows = [];
  for (const key of Object.keys(labels) as (keyof T)[]) {
    if (!(key in after)) continue;
    const oldValue = toText(before[key]);
    const newValue = toText(after[key]);
    if (oldValue !== newValue) {
      rows.push({ field: labels[key]!, oldValue, newValue });
    }
  }
  for (const row of rows) await audit({ ...base, action: "UPDATE", ...row });
  return rows.length;
}
