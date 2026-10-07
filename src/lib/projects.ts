import "server-only";
import { db } from "@/lib/db";
import { can, canViewProject } from "@/lib/auth/permissions";
import type { Prisma } from "@/generated/prisma/client";
import type { Profile } from "@/generated/prisma/enums";

/** Génère le prochain code projet de l'année : PRJ-2026-001. */
export async function nextProjectCode(year = new Date().getFullYear()) {
  const prefix = `PRJ-${year}-`;
  const last = await db.project.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const nextNumber = last ? Number(last.code.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(nextNumber).padStart(3, "0")}`;
}

type Viewer = { id: string; profile: Profile; directionId: string | null };

/** Restreint une requête aux projets visibles par l'utilisateur. */
export function visibleProjectsWhere(user: Viewer): Prisma.ProjectWhereInput {
  if (can(user.profile, "projects.viewAll")) return {};
  const conditions: Prisma.ProjectWhereInput[] = [
    { ownerId: user.id },
    { leadId: user.id },
    { members: { some: { userId: user.id } } },
  ];
  if (user.profile === "MANAGER" && user.directionId) {
    conditions.push({ directionId: user.directionId });
  }
  return { OR: conditions };
}

export const projectDetailInclude = {
  type: true,
  category: true,
  priority: true,
  status: true,
  strategicAxis: true,
  fundingSource: true,
  direction: true,
  pole: true,
  sponsor: true,
  owner: true,
  lead: true,
  members: { include: { user: { include: { direction: true } } } },
} satisfies Prisma.ProjectInclude;

export type ProjectDetail = Prisma.ProjectGetPayload<{ include: typeof projectDetailInclude }>;

/** Charge un projet si l'utilisateur a le droit de le voir, sinon null. */
export async function getVisibleProject(id: string, user: Viewer) {
  const project = await db.project.findUnique({ where: { id }, include: projectDetailInclude });
  if (!project) return null;
  return canViewProject(user, project) ? project : null;
}

/** Champs personnalisés applicables à un projet : ceux de son type + les siens. */
export async function projectFields(project: { id: string; typeId: string | null }) {
  const [definitions, values] = await Promise.all([
    db.customFieldDef.findMany({
      where: {
        active: true,
        OR: [{ projectId: project.id }, ...(project.typeId ? [{ projectTypeId: project.typeId }] : [])],
      },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    }),
    db.customFieldValue.findMany({ where: { projectId: project.id } }),
  ]);
  const byDefinition = new Map(values.map((v) => [v.definitionId, v.value]));
  return definitions.map((definition) => ({ definition, value: byDefinition.get(definition.id) ?? null }));
}

export const PROJECT_TABS = [
  { slug: "", label: "Synthèse" },
  { slug: "informations", label: "Informations" },
  { slug: "planification", label: "Planification" },
  { slug: "jalons", label: "Jalons" },
  { slug: "indicateurs", label: "Indicateurs" },
  { slug: "diligences", label: "Diligences" },
  { slug: "risques", label: "Risques" },
  { slug: "budget", label: "Budget" },
  { slug: "livrables", label: "Livrables" },
  { slug: "reunions", label: "Réunions" },
  { slug: "documents", label: "Documents" },
  { slug: "equipe", label: "Équipe" },
  { slug: "raci", label: "RACI" },
  { slug: "temps", label: "Temps" },
  { slug: "champs", label: "Rubriques" },
] as const;

export const PROJECT_TABS_SOON = [] as const;
