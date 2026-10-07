import type { Profile, ProjectRole } from "@/generated/prisma/enums";

export const PROFILE_LABELS: Record<Profile, string> = {
  ADMIN: "Administrateur",
  DIRECTION: "Direction Générale",
  MANAGER: "Responsable / Manager",
  UTILISATEUR: "Utilisateur",
};

export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
  CHEF_DE_PROJET: "Chef de projet",
  RESPONSABLE: "Responsable",
  MEMBRE: "Membre de l’équipe",
  OBSERVATEUR: "Observateur",
};

export type Permission =
  | "admin.users"
  | "admin.organisation"
  | "admin.referentiels"
  | "admin.audit"
  | "admin.customFields"
  | "projects.create"
  | "projects.viewAll"
  | "strategy.manage"
  | "ptba.manage"
  | "ptba.validate";

const MATRIX: Record<Profile, Permission[]> = {
  ADMIN: [
    "admin.users",
    "admin.organisation",
    "admin.referentiels",
    "admin.audit",
    "admin.customFields",
    "projects.create",
    "projects.viewAll",
    "strategy.manage",
    "ptba.manage",
    "ptba.validate",
  ],
  DIRECTION: ["admin.audit", "projects.viewAll", "projects.create", "strategy.manage", "ptba.manage", "ptba.validate"],
  MANAGER: ["projects.create", "ptba.manage"],
  UTILISATEUR: [],
};

export function can(profile: Profile, permission: Permission) {
  return MATRIX[profile].includes(permission);
}

type ProjectAccessInput = {
  ownerId: string | null;
  leadId: string | null;
  directionId: string | null;
  members?: { userId: string; role: ProjectRole }[];
};

type UserAccessInput = { id: string; profile: Profile; directionId: string | null };

/** Lecture : tout le portefeuille, les projets de sa direction (manager), ou ceux où l'on intervient. */
export function canViewProject(user: UserAccessInput, project: ProjectAccessInput) {
  if (can(user.profile, "projects.viewAll")) return true;
  if (project.ownerId === user.id || project.leadId === user.id) return true;
  if (project.members?.some((m) => m.userId === user.id)) return true;
  return user.profile === "MANAGER" && !!project.directionId && project.directionId === user.directionId;
}

/** Modification : administrateur, responsable ou chef du projet, manager de la direction porteuse. */
export function canEditProject(user: UserAccessInput, project: ProjectAccessInput) {
  if (user.profile === "ADMIN") return true;
  if (project.ownerId === user.id || project.leadId === user.id) return true;
  return user.profile === "MANAGER" && !!project.directionId && project.directionId === user.directionId;
}
