import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can, type Permission } from "@/lib/auth/permissions";

export const SESSION_COOKIE = "synap_session";

const ttlMinutes = () => Number(process.env.SESSION_TTL_MINUTES ?? 480);
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function requestMeta() {
  const h = await headers();
  return {
    ipAddress: h.get("x-forwarded-for")?.split(",")[0].trim() ?? h.get("x-real-ip") ?? null,
    userAgent: h.get("user-agent"),
  };
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlMinutes() * 60_000);
  const meta = await requestMeta();
  await db.session.create({
    data: { id: hashToken(token), userId, expiresAt, ...meta },
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "true",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: hashToken(token) } });
  store.delete(SESSION_COOKIE);
}

/** Utilisateur connecté (ou null). Expiration glissante : la session est prolongée à l'usage. */
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: { include: { direction: true, pole: true, manager: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;

  // Prolongation au plus une fois par minute pour limiter les écritures
  if (Date.now() - session.lastSeenAt.getTime() > 60_000) {
    await db.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + ttlMinutes() * 60_000) },
    });
  }
  return session.user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/**
 * Exige un utilisateur connecté. Tant que le mot de passe temporaire n'est pas changé,
 * seul l'écran « Mon compte » est accessible (`allowPendingPassword`).
 */
export async function requireUser({ allowPendingPassword = false } = {}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !allowPendingPassword) redirect("/compte?premiere=1");
  return user;
}

export async function requirePermission(permission: Permission) {
  const user = await requireUser();
  if (!can(user.profile, permission)) redirect("/?refus=1");
  return user;
}

export function displayName(user: { firstName: string; lastName: string }) {
  return `${user.firstName} ${user.lastName}`;
}
