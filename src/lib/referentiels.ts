import type { RefKind } from "@/generated/prisma/enums";

export const REF_KINDS: { kind: RefKind; slug: string; label: string; description: string }[] = [
  { kind: "PROJECT_STATUS", slug: "statuts-projet", label: "Statuts de projet", description: "Étapes du cycle de vie d’un projet." },
  { kind: "TASK_STATUS", slug: "statuts-taches", label: "Statuts de tâche", description: "Utilisés pour les activités, tâches et diligences." },
  { kind: "MEETING_TYPE", slug: "types-reunion", label: "Types de réunion", description: "Comités, ateliers et revues de projet." },
  { kind: "DILIGENCE_STATUS", slug: "statuts-diligence", label: "Statuts de diligence", description: "Suivi des actions issues des réunions et comités." },
  { kind: "BUDGET_NATURE", slug: "natures-depense", label: "Natures de dépense", description: "Ventilation des lignes budgétaires." },
  { kind: "PROJECT_TYPE", slug: "types-projet", label: "Types de projet", description: "Chaque type pourra porter ses propres champs personnalisés." },
  { kind: "PROJECT_CATEGORY", slug: "categories-projet", label: "Catégories de projet", description: "Classement thématique des projets." },
  { kind: "PRIORITY", slug: "priorites", label: "Priorités", description: "Niveaux de priorité des projets, tâches et diligences." },
  { kind: "STRATEGIC_AXIS", slug: "axes-strategiques", label: "Axes stratégiques", description: "Alignement stratégique des projets." },
  { kind: "FUNDING_SOURCE", slug: "sources-financement", label: "Sources de financement", description: "Origine du budget des projets." },
  { kind: "ACTIVITY_TYPE", slug: "types-activite", label: "Types d’activité", description: "Utilisés dans les fiches de temps." },
  { kind: "RISK_CATEGORY", slug: "categories-risque", label: "Catégories de risque", description: "Classement des risques et problèmes." },
  { kind: "KPI_TYPE", slug: "types-kpi", label: "Types de KPI", description: "Nature des indicateurs de performance." },
  { kind: "DOCUMENT_CATEGORY", slug: "categories-document", label: "Catégories de document", description: "Classement de l’espace documentaire." },
];

export const refKindBySlug = (slug: string) => REF_KINDS.find((k) => k.slug === slug);
export const refKindLabel = (kind: RefKind) => REF_KINDS.find((k) => k.kind === kind)?.label ?? kind;
