import type { DependencyKind, MilestoneStatus, WorkItemKind } from "@/generated/prisma/enums";

/** Libellés partagés entre le serveur et les composants clients. */
export const WORK_ITEM_LABELS: Record<WorkItemKind, string> = {
  PHASE: "Phase",
  ACTIVITE: "Activité",
  SOUS_ACTIVITE: "Sous-activité",
  TACHE: "Tâche",
};

export const DEPENDENCY_LABELS: Record<DependencyKind, string> = {
  FIN_DEBUT: "Fin → Début",
  DEBUT_DEBUT: "Début → Début",
  FIN_FIN: "Fin → Fin",
};

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  PREVU: "Prévu",
  ATTEINT: "Atteint",
  ANNULE: "Annulé",
};
