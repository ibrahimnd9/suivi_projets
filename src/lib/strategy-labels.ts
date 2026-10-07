import type { PtbaActivityStatus, PtbaYearStatus, StrategicStatus } from "@/generated/prisma/enums";

/** Libellés partagés entre le serveur et les composants clients. */
export const STRATEGIC_STATUS_LABELS: Record<StrategicStatus, string> = {
  PREVU: "Prévu",
  EN_COURS: "En cours",
  ATTEINT: "Atteint",
  PARTIELLEMENT_ATTEINT: "Partiellement atteint",
  NON_ATTEINT: "Non atteint",
  ABANDONNE: "Abandonné",
};

export const STRATEGIC_STATUS_TONES: Record<StrategicStatus, "zinc" | "brand" | "green" | "amber" | "red"> = {
  PREVU: "zinc",
  EN_COURS: "brand",
  ATTEINT: "green",
  PARTIELLEMENT_ATTEINT: "amber",
  NON_ATTEINT: "red",
  ABANDONNE: "zinc",
};

export const PTBA_YEAR_STATUS_LABELS: Record<PtbaYearStatus, string> = {
  PREPARATION: "En préparation",
  VALIDATION_DGA: "En validation DGA",
  VALIDATION_DG: "En validation DG",
  SOUMIS_CA: "Soumis au Conseil d’administration",
  EN_EXECUTION: "En exécution",
  CLOS: "Clos",
};

export const PTBA_YEAR_STATUS_TONES: Record<PtbaYearStatus, "zinc" | "brand" | "amber" | "green"> = {
  PREPARATION: "zinc",
  VALIDATION_DGA: "amber",
  VALIDATION_DG: "amber",
  SOUMIS_CA: "amber",
  EN_EXECUTION: "green",
  CLOS: "brand",
};

export const PTBA_ACTIVITY_STATUS_LABELS: Record<PtbaActivityStatus, string> = {
  NON_DEMARREE: "Non démarrée",
  EN_PREPARATION: "En préparation",
  EN_COURS: "En cours",
  EN_RETARD: "En retard",
  SUSPENDUE: "Suspendue",
  TERMINEE: "Terminée",
  ANNULEE: "Annulée",
};

export const PTBA_ACTIVITY_STATUS_TONES: Record<PtbaActivityStatus, "zinc" | "brand" | "amber" | "red" | "green"> = {
  NON_DEMARREE: "zinc",
  EN_PREPARATION: "zinc",
  EN_COURS: "brand",
  EN_RETARD: "red",
  SUSPENDUE: "amber",
  TERMINEE: "green",
  ANNULEE: "zinc",
};

/** Activités considérées comme soldées : elles n'alimentent plus les alertes. */
export const PTBA_CLOSED_STATUSES: PtbaActivityStatus[] = ["TERMINEE", "ANNULEE"];

export const QUARTERS = [
  { key: "q1", label: "T1" },
  { key: "q2", label: "T2" },
  { key: "q3", label: "T3" },
  { key: "q4", label: "T4" },
] as const;
