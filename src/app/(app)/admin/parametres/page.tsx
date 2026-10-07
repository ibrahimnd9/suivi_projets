import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import {
  DEFAULT_ALERTS,
  DEFAULT_WEIGHTS,
  WEIGHT_LABELS,
  getAlertSettings,
  getHealthWeights,
} from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { saveAlertSettings, saveHealthWeights } from "./actions";

export const metadata: Metadata = { title: "Paramètres" };

export default async function SettingsPage() {
  await requirePermission("admin.referentiels");
  const [weights, alerts] = await Promise.all([getHealthWeights(), getAlertSettings()]);
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);

  return (
    <>
      <PageHeader
        title="Paramètres généraux"
        description="Pondérations du score de santé et seuils déclenchant les alertes."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-semibold text-brand-800">Score de santé des projets</h2>
          <p className="mb-4 text-sm text-zinc-500">
            Répartition des points entre les composantes (total actuel : {total} %). Une composante sans donnée est
            ignorée, son poids est réparti sur les autres.
          </p>
          <ActionForm action={saveHealthWeights} submitLabel="Enregistrer les pondérations">
            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.keys(WEIGHT_LABELS) as (keyof typeof WEIGHT_LABELS)[]).map((key) => (
                <div key={key}>
                  <label className="label">{WEIGHT_LABELS[key]} (%)</label>
                  <input
                    name={key}
                    type="number"
                    min="0"
                    max="100"
                    defaultValue={weights[key]}
                    className="input"
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-zinc-500">
              Valeurs du cahier des charges : planning {DEFAULT_WEIGHTS.planning} %, budget {DEFAULT_WEIGHTS.budget} %,
              avancement {DEFAULT_WEIGHTS.progress} %, risques {DEFAULT_WEIGHTS.risks} %, indicateurs{" "}
              {DEFAULT_WEIGHTS.kpi} %, ressources {DEFAULT_WEIGHTS.resources} %.
            </p>
          </ActionForm>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold text-brand-800">Seuils d’alerte</h2>
          <p className="mb-4 text-sm text-zinc-500">
            Ces seuils pilotent les notifications automatiques et la couleur des projets.
          </p>
          <ActionForm action={saveAlertSettings} submitLabel="Enregistrer les seuils">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Prévenir X jours avant l’échéance</label>
                <input name="dueSoonDays" type="number" min="1" max="60" defaultValue={alerts.dueSoonDays} className="input" />
              </div>
              <div>
                <label className="label">Alerte budget à partir de (%)</label>
                <input name="budgetThreshold" type="number" min="1" max="200" defaultValue={alerts.budgetThreshold} className="input" />
              </div>
              <div>
                <label className="label">Projet vert à partir d’un score de</label>
                <input name="greenFrom" type="number" min="1" max="100" defaultValue={alerts.greenFrom} className="input" />
              </div>
              <div>
                <label className="label">Projet rouge en dessous de</label>
                <input name="redBelow" type="number" min="0" max="99" defaultValue={alerts.redBelow} className="input" />
              </div>
            </div>
            <p className="text-xs text-zinc-500">
              Valeurs par défaut : {DEFAULT_ALERTS.dueSoonDays} jours, {DEFAULT_ALERTS.budgetThreshold} % du budget,
              vert à partir de {DEFAULT_ALERTS.greenFrom}, rouge en dessous de {DEFAULT_ALERTS.redBelow}.
            </p>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
