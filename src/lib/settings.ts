import "server-only";
import { db } from "@/lib/db";

/** Pondérations du score de santé (total attendu : 100). */
export type HealthWeights = {
  planning: number;
  budget: number;
  progress: number;
  risks: number;
  kpi: number;
  resources: number;
};

/** Seuils déclenchant les alertes automatiques. */
export type AlertSettings = {
  /** Jours avant échéance pour prévenir (jalons, tâches, diligences) */
  dueSoonDays: number;
  /** Taux de consommation budgétaire déclenchant une alerte (%) */
  budgetThreshold: number;
  /** Score en dessous duquel un projet passe en rouge */
  redBelow: number;
  /** Score au-dessus duquel un projet est vert */
  greenFrom: number;
};

export const DEFAULT_WEIGHTS: HealthWeights = {
  planning: 25,
  budget: 20,
  progress: 25,
  risks: 15,
  kpi: 10,
  resources: 5,
};

export const DEFAULT_ALERTS: AlertSettings = {
  dueSoonDays: 7,
  budgetThreshold: 90,
  redBelow: 50,
  greenFrom: 75,
};

export const WEIGHT_LABELS: Record<keyof HealthWeights, string> = {
  planning: "Planning",
  budget: "Budget",
  progress: "Avancement",
  risks: "Risques",
  kpi: "Indicateurs",
  resources: "Ressources",
};

async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.appSetting.findUnique({ where: { key } });
  if (!row) return fallback;
  return { ...fallback, ...(row.value as Partial<T>) };
}

export const getHealthWeights = () => readSetting<HealthWeights>("healthWeights", DEFAULT_WEIGHTS);
export const getAlertSettings = () => readSetting<AlertSettings>("alertSettings", DEFAULT_ALERTS);

export async function saveSetting(key: string, value: Record<string, number>) {
  await db.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

/** Date de la dernière analyse des alertes. */
export async function getLastAlertScan(): Promise<Date | null> {
  const row = await db.appSetting.findUnique({ where: { key: "lastAlertScan" } });
  const value = row?.value as { at?: string } | undefined;
  return value?.at ? new Date(value.at) : null;
}

export async function setLastAlertScan(at: Date) {
  await db.appSetting.upsert({
    where: { key: "lastAlertScan" },
    update: { value: { at: at.toISOString() } },
    create: { key: "lastAlertScan", value: { at: at.toISOString() } },
  });
}
