import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, displayName } from "@/lib/auth/session";
import { canEditProject } from "@/lib/auth/permissions";
import { getVisibleProject } from "@/lib/projects";
import {
  KPI_DIRECTION_LABELS,
  KPI_FREQUENCY_LABELS,
  kpiAchievement,
  kpiState,
} from "@/lib/monitoring";
import { Badge, EmptyState, ProgressBar, formatDate } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { deleteKpi, saveKpi, saveKpiValue } from "@/app/(app)/projets/monitoring-actions";
import { KpiDirection, KpiFrequency } from "@/generated/prisma/enums";

const numberFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const show = (value: { toString(): string } | null, unit: string | null) =>
  value === null ? "—" : `${numberFormat.format(Number(value.toString()))}${unit ? ` ${unit}` : ""}`;

function KpiFields({
  values,
  types,
  people,
}: {
  values?: {
    name: string;
    definition: string | null;
    typeId: string | null;
    unit: string | null;
    frequency: KpiFrequency;
    direction: KpiDirection;
    baseline: { toString(): string } | null;
    target: { toString(): string } | null;
    ownerId: string | null;
    source: string | null;
    alertThreshold: { toString(): string };
    okThreshold: { toString(): string };
    sortOrder: number;
  };
  types: { id: string; label: string }[];
  people: { id: string; label: string }[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label">Nom de l’indicateur *</label>
        <input name="name" defaultValue={values?.name} required className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Définition</label>
        <input name="definition" defaultValue={values?.definition ?? ""} className="input" />
      </div>
      <div>
        <label className="label">Type</label>
        <select name="typeId" defaultValue={values?.typeId ?? ""} className="input">
          <option value="">—</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Unité</label>
        <input name="unit" defaultValue={values?.unit ?? ""} placeholder="%, agents, jours…" className="input" />
      </div>
      <div>
        <label className="label">Fréquence</label>
        <select name="frequency" defaultValue={values?.frequency ?? KpiFrequency.MENSUELLE} className="input">
          {Object.entries(KPI_FREQUENCY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Sens de progression</label>
        <select name="direction" defaultValue={values?.direction ?? KpiDirection.HAUSSE} className="input">
          {Object.entries(KPI_DIRECTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Valeur de référence</label>
        <input name="baseline" inputMode="decimal" defaultValue={values?.baseline?.toString() ?? ""} className="input" />
      </div>
      <div>
        <label className="label">Cible</label>
        <input name="target" inputMode="decimal" defaultValue={values?.target?.toString() ?? ""} className="input" />
      </div>
      <div>
        <label className="label">Responsable</label>
        <select name="ownerId" defaultValue={values?.ownerId ?? ""} className="input">
          <option value="">—</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Source de données</label>
        <input name="source" defaultValue={values?.source ?? ""} className="input" />
      </div>
      <div className="grid grid-cols-3 gap-3 sm:col-span-2">
        <div>
          <label className="label">Seuil d’alerte (%)</label>
          <input name="alertThreshold" type="number" min="0" max="200" defaultValue={values?.alertThreshold?.toString() ?? "80"} className="input" />
        </div>
        <div>
          <label className="label">Seuil d’atteinte (%)</label>
          <input name="okThreshold" type="number" min="0" max="200" defaultValue={values?.okThreshold?.toString() ?? "95"} className="input" />
        </div>
        <div>
          <label className="label">Ordre</label>
          <input name="sortOrder" type="number" min="0" defaultValue={values?.sortOrder ?? 0} className="input" />
        </div>
      </div>
    </div>
  );
}

export default async function ProjectKpiPage({ params }: PageProps<"/projets/[id]/indicateurs">) {
  const user = await requireUser();
  const { id } = await params;
  const project = await getVisibleProject(id, user);
  if (!project) notFound();
  const editable = canEditProject(user, project);

  const [kpis, types] = await Promise.all([
    db.kpi.findMany({
      where: { projectId: id },
      include: { type: true, owner: true, values: { orderBy: { period: "desc" } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    db.refItem.findMany({ where: { kind: "KPI_TYPE", active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  const people = project.members.map((m) => ({ id: m.userId, label: displayName(m.user) }));
  const typeOptions = types.map((t) => ({ id: t.id, label: t.label }));
  const today = new Date().toISOString().slice(0, 10);

  const rows = kpis.map((kpi) => {
    const latest = kpi.values[0] ?? null;
    const achievement = kpiAchievement(kpi, latest?.value ?? null);
    const previous = kpi.values[1] ?? null;
    const trend =
      latest && previous
        ? Number(latest.value) === Number(previous.value)
          ? "→"
          : (Number(latest.value) > Number(previous.value)) === (kpi.direction === "HAUSSE")
            ? "↗"
            : "↘"
        : "—";
    return { kpi, latest, achievement, state: kpiState(achievement, kpi), trend };
  });

  const counts = {
    total: rows.length,
    ok: rows.filter((r) => r.state.tone === "green").length,
    alert: rows.filter((r) => r.state.tone === "amber").length,
    ko: rows.filter((r) => r.state.tone === "red").length,
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Indicateurs", counts.total, "text-brand-700"],
          ["Atteints", counts.ok, "text-emerald-600"],
          ["En alerte", counts.alert, "text-amber-600"],
          ["Non atteints", counts.ko, "text-red-600"],
        ].map(([label, value, tone]) => (
          <div key={label as string} className="card p-4">
            <p className="text-sm text-zinc-500">{label}</p>
            <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
          </div>
        ))}
      </div>

      {editable && (
        <details className="card p-5">
          <summary className="cursor-pointer list-none font-semibold text-brand-800">+ Ajouter un indicateur</summary>
          <div className="mt-4">
            <ActionForm action={saveKpi.bind(null, project.id, null)} submitLabel="Ajouter" resetOnSuccess>
              <KpiFields types={typeOptions} people={people} />
            </ActionForm>
          </div>
        </details>
      )}

      {rows.length === 0 ? (
        <div className="card"><EmptyState>Aucun indicateur défini pour ce projet.</EmptyState></div>
      ) : (
        <div className="space-y-4">
          {rows.map(({ kpi, latest, achievement, state, trend }) => (
            <article key={kpi.id} className="card p-5">
              <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-brand-800">{kpi.name}</h3>
                  <p className="text-xs text-zinc-500">
                    {kpi.type?.label ?? "Type non précisé"} · {KPI_FREQUENCY_LABELS[kpi.frequency]}
                    {kpi.owner && ` · ${displayName(kpi.owner)}`}
                    {kpi.source && ` · source : ${kpi.source}`}
                  </p>
                  {kpi.definition && <p className="mt-1 text-sm text-zinc-600">{kpi.definition}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={state.tone}>{state.label}</Badge>
                  <span className="text-lg" title="Tendance">{trend}</span>
                </div>
              </header>

              <div className="grid gap-4 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-zinc-500">Référence</p>
                  <p className="font-medium">{show(kpi.baseline, kpi.unit)}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Cible</p>
                  <p className="font-medium">{show(kpi.target, kpi.unit)}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Valeur actuelle</p>
                  <p className="font-medium">
                    {show(latest?.value ?? null, kpi.unit)}
                    {latest && <span className="ml-1 text-xs text-zinc-400">au {formatDate(latest.period)}</span>}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500">Taux de réalisation</p>
                  {achievement === null ? (
                    <p className="font-medium text-zinc-400">—</p>
                  ) : (
                    <ProgressBar value={achievement} />
                  )}
                </div>
              </div>

              {kpi.values.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Période</th>
                        <th>Valeur</th>
                        <th>Taux</th>
                        <th>Commentaire</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kpi.values.slice(0, 6).map((value) => {
                        const rate = kpiAchievement(kpi, value.value);
                        return (
                          <tr key={value.id}>
                            <td className="whitespace-nowrap">{formatDate(value.period)}</td>
                            <td className="whitespace-nowrap">{show(value.value, kpi.unit)}</td>
                            <td className="whitespace-nowrap">{rate === null ? "—" : `${Math.round(rate)} %`}</td>
                            <td>{value.comment ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {editable && (
                <div className="mt-4 grid gap-4 border-t border-zinc-100 pt-4 lg:grid-cols-[1fr_auto]">
                  <ActionForm action={saveKpiValue.bind(null, project.id, kpi.id)} submitLabel="Enregistrer la valeur" resetOnSuccess>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <input name="period" type="date" defaultValue={today} required className="input" aria-label="Période" />
                      <input name="value" inputMode="decimal" placeholder="Valeur mesurée" required className="input" />
                      <input name="comment" placeholder="Commentaire" className="input" />
                    </div>
                  </ActionForm>
                  <div className="relative flex items-start gap-2">
                    <details>
                      <summary className="btn btn-secondary cursor-pointer list-none px-2 py-1 text-xs">Modifier</summary>
                      <div className="absolute right-0 z-10 mt-2 w-[min(46rem,85vw)] space-y-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
                        <ActionForm action={saveKpi.bind(null, project.id, kpi.id)}>
                          <KpiFields values={kpi} types={typeOptions} people={people} />
                        </ActionForm>
                        <form action={deleteKpi.bind(null, project.id, kpi.id)} className="border-t border-zinc-100 pt-3">
                          <SubmitButton className="btn btn-danger" pendingLabel="…" confirm={`Supprimer l’indicateur « ${kpi.name} » et ses valeurs ?`}>
                            Supprimer
                          </SubmitButton>
                        </form>
                      </div>
                    </details>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
