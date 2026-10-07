import "server-only";
import { db } from "@/lib/db";

export type ProjectFormOptions = Awaited<ReturnType<typeof loadProjectFormOptions>>;

/** Listes de choix du formulaire projet (référentiels actifs, organisation, personnes). */
export async function loadProjectFormOptions() {
  const [refItems, directions, poles, users] = await Promise.all([
    db.refItem.findMany({
      where: {
        active: true,
        kind: { in: ["PROJECT_TYPE", "PROJECT_CATEGORY", "PROJECT_STATUS", "PRIORITY", "STRATEGIC_AXIS", "FUNDING_SOURCE"] },
      },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    }),
    db.direction.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.pole.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.user.findMany({
      where: { active: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  const byKind = (kind: string) =>
    refItems.filter((r) => r.kind === kind).map((r) => ({ id: r.id, label: r.label, isDefault: r.isDefault }));

  return {
    types: byKind("PROJECT_TYPE"),
    categories: byKind("PROJECT_CATEGORY"),
    statuses: byKind("PROJECT_STATUS"),
    priorities: byKind("PRIORITY"),
    axes: byKind("STRATEGIC_AXIS"),
    fundingSources: byKind("FUNDING_SOURCE"),
    directions: directions.map((d) => ({ id: d.id, name: d.name })),
    poles: poles.map((p) => ({ id: p.id, name: p.name, directionId: p.directionId })),
    people: users.map((u) => ({ id: u.id, name: `${u.lastName.toUpperCase()} ${u.firstName}` })),
  };
}
