"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { hashPassword, passwordPolicyError, verifyPassword } from "@/lib/auth/password";
import { audit } from "@/lib/audit";
import type { FormState } from "@/components/ui";

export async function changePassword(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser({ allowPendingPassword: true });
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!(await verifyPassword(current, user.passwordHash))) {
    return { fieldErrors: { current: ["Mot de passe actuel incorrect."] } };
  }
  const policy = passwordPolicyError(next);
  if (policy) return { fieldErrors: { next: [policy] } };
  if (next !== confirm) return { fieldErrors: { confirm: ["Les deux mots de passe ne correspondent pas."] } };
  if (next === current) return { fieldErrors: { next: ["Le nouveau mot de passe doit être différent de l’actuel."] } };

  const wasFirst = user.mustChangePassword;
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next), mustChangePassword: false, passwordChangedAt: new Date() },
  });
  await audit({ actor: user, action: "PASSWORD_CHANGE", entity: "Utilisateur", entityId: user.id, entityLabel: user.email });

  if (wasFirst) redirect("/");
  return { success: "Mot de passe modifié." };
}
