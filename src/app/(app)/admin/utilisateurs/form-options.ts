import "server-only";
import { db } from "@/lib/db";
import { PROFILE_LABELS } from "@/lib/auth/permissions";

/** Listes de choix communes aux formulaires de création et de modification. */
export async function loadUserFormOptions(excludeUserId?: string) {
  const [directions, poles, managers] = await Promise.all([
    db.direction.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.pole.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.user.findMany({
      where: { active: true, id: excludeUserId ? { not: excludeUserId } : undefined },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);
  return {
    profiles: Object.entries(PROFILE_LABELS).map(([value, label]) => ({ value, label })),
    directions: directions.map((d) => ({ id: d.id, name: d.name })),
    poles: poles.map((p) => ({ id: p.id, name: p.name, directionId: p.directionId })),
    managers: managers.map((m) => ({ id: m.id, name: `${m.lastName.toUpperCase()} ${m.firstName}` })),
  };
}
