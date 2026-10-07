"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession, getCurrentUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import type { FormState } from "@/components/ui";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

const schema = z.object({
  email: z.email("Adresse email invalide.").transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1, "Mot de passe requis."),
  suite: z.string().optional(),
});

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, password, suite } = parsed.data;
  const invalid = { error: "Email ou mot de passe incorrect." };

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    await audit({ actor: null, action: "LOGIN_FAILED", entity: "Utilisateur", entityLabel: email });
    return invalid;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { error: `Compte temporairement verrouillé après ${MAX_ATTEMPTS} échecs. Réessayez plus tard.` };
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    const count = user.failedLoginCount + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: count >= MAX_ATTEMPTS ? 0 : count,
        lockedUntil: count >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    await audit({ actor: user, action: "LOGIN_FAILED", entity: "Utilisateur", entityId: user.id, entityLabel: email });
    return invalid;
  }

  await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  await createSession(user.id);
  await audit({ actor: user, action: "LOGIN", entity: "Utilisateur", entityId: user.id, entityLabel: email });

  if (user.mustChangePassword) redirect("/compte?premiere=1");
  // N'accepter que des chemins internes
  redirect(suite && suite.startsWith("/") && !suite.startsWith("//") ? suite : "/");
}

export async function logout() {
  const user = await getCurrentUser();
  if (user) {
    await audit({ actor: user, action: "LOGOUT", entity: "Utilisateur", entityId: user.id, entityLabel: user.email });
  }
  await destroySession();
  redirect("/login");
}
