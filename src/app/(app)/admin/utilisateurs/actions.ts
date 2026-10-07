"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission, displayName } from "@/lib/auth/session";
import { generateTemporaryPassword, hashPassword } from "@/lib/auth/password";
import { audit, auditChanges } from "@/lib/audit";
import { PROFILE_LABELS } from "@/lib/auth/permissions";
import { Profile } from "@/generated/prisma/enums";
import type { FormState } from "@/components/ui";

const optionalId = z
  .string()
  .optional()
  .transform((v) => (v ? v : null));
const optionalText = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : null));

const userSchema = z.object({
  firstName: z.string().trim().min(1, "Prénom requis."),
  lastName: z.string().trim().min(1, "Nom requis."),
  email: z.email("Adresse email invalide.").transform((v) => v.trim().toLowerCase()),
  profile: z.enum(Profile),
  jobTitle: optionalText,
  phone: optionalText,
  directionId: optionalId,
  poleId: optionalId,
  managerId: optionalId,
  weeklyCapacityHours: z.coerce.number().min(0, "Valeur invalide.").max(80, "Maximum 80 h."),
});

type UserInput = z.infer<typeof userSchema>;

async function validateRelations(data: UserInput, userId?: string): Promise<FormState | null> {
  if (data.poleId) {
    const pole = await db.pole.findUnique({ where: { id: data.poleId } });
    if (!pole || (data.directionId && pole.directionId !== data.directionId)) {
      return { fieldErrors: { poleId: ["Ce pôle n’appartient pas à la direction choisie."] } };
    }
  }
  if (data.managerId && userId) {
    // Empêche les boucles hiérarchiques (A → B → … → A)
    let current: string | null = data.managerId;
    for (let depth = 0; current && depth < 50; depth++) {
      if (current === userId) {
        return { fieldErrors: { managerId: ["Ce choix créerait une boucle hiérarchique."] } };
      }
      const next: { managerId: string | null } | null = await db.user.findUnique({
        where: { id: current },
        select: { managerId: true },
      });
      current = next?.managerId ?? null;
    }
  }
  return null;
}

export async function createUser(_: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("admin.users");
  const parsed = userSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const data = parsed.data;

  if (await db.user.findUnique({ where: { email: data.email } })) {
    return { fieldErrors: { email: ["Un utilisateur existe déjà avec cet email."] } };
  }
  const relationError = await validateRelations(data);
  if (relationError) return relationError;

  const temporaryPassword = generateTemporaryPassword();
  const user = await db.user.create({
    data: { ...data, passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true },
  });
  await audit({
    actor,
    action: "CREATE",
    entity: "Utilisateur",
    entityId: user.id,
    entityLabel: `${displayName(user)} (${user.email})`,
    newValue: PROFILE_LABELS[user.profile],
  });
  revalidatePath("/admin/utilisateurs");
  return {
    success: `Compte créé pour ${displayName(user)}. Mot de passe temporaire à transmettre (à changer obligatoirement à la première connexion) :`,
    secret: temporaryPassword,
  };
}

export async function updateUser(userId: string, _: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("admin.users");
  const parsed = userSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const data = parsed.data;

  const before = await db.user.findUnique({
    where: { id: userId },
    include: { direction: true, pole: true, manager: true },
  });
  if (!before) return { error: "Utilisateur introuvable." };
  if (userId === actor.id && data.profile !== "ADMIN") {
    return { fieldErrors: { profile: ["Vous ne pouvez pas retirer votre propre profil administrateur."] } };
  }
  const duplicate = await db.user.findUnique({ where: { email: data.email } });
  if (duplicate && duplicate.id !== userId) {
    return { fieldErrors: { email: ["Un autre utilisateur utilise déjà cet email."] } };
  }
  const relationError = await validateRelations(data, userId);
  if (relationError) return relationError;

  const after = await db.user.update({
    where: { id: userId },
    data,
    include: { direction: true, pole: true, manager: true },
  });

  const view = (u: NonNullable<typeof before>) => ({
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    profile: PROFILE_LABELS[u.profile],
    jobTitle: u.jobTitle,
    phone: u.phone,
    direction: u.direction?.name,
    pole: u.pole?.name,
    manager: u.manager ? displayName(u.manager) : null,
    weeklyCapacityHours: u.weeklyCapacityHours.toString(),
  });
  const count = await auditChanges(
    { actor, entity: "Utilisateur", entityId: userId, entityLabel: `${displayName(after)} (${after.email})` },
    view(before),
    view(after),
    {
      firstName: "Prénom",
      lastName: "Nom",
      email: "Email",
      profile: "Profil",
      jobTitle: "Fonction",
      phone: "Téléphone",
      direction: "Direction",
      pole: "Pôle",
      manager: "Supérieur hiérarchique (N+1)",
      weeklyCapacityHours: "Capacité hebdomadaire (h)",
    },
  );
  revalidatePath("/admin/utilisateurs");
  return { success: count ? "Modifications enregistrées." : "Aucune modification." };
}

export async function setUserActive(userId: string, active: boolean) {
  const actor = await requirePermission("admin.users");
  if (userId === actor.id) return;
  const user = await db.user.update({ where: { id: userId }, data: { active } });
  if (!active) await db.session.deleteMany({ where: { userId } });
  await audit({
    actor,
    action: "UPDATE",
    entity: "Utilisateur",
    entityId: userId,
    entityLabel: `${displayName(user)} (${user.email})`,
    field: "Statut du compte",
    oldValue: active ? "Désactivé" : "Actif",
    newValue: active ? "Actif" : "Désactivé",
  });
  revalidatePath("/admin/utilisateurs");
  redirect(`/admin/utilisateurs/${userId}`);
}

export async function resetPassword(userId: string): Promise<FormState> {
  const actor = await requirePermission("admin.users");
  const temporaryPassword = generateTemporaryPassword();
  const user = await db.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });
  await db.session.deleteMany({ where: { userId } });
  await audit({
    actor,
    action: "PASSWORD_RESET",
    entity: "Utilisateur",
    entityId: userId,
    entityLabel: `${displayName(user)} (${user.email})`,
  });
  return { success: "Nouveau mot de passe temporaire (à communiquer à l’utilisateur) :", secret: temporaryPassword };
}
