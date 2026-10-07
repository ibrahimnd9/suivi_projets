import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, displayName } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { activityBudget, activityInclude, computeActivityProgress, defaultPtbaYear, isActivityLate, ptbaTotals } from "@/lib/ptba";
import {
  PTBA_ACTIVITY_STATUS_LABELS,
  PTBA_ACTIVITY_STATUS_TONES,
  PTBA_YEAR_STATUS_LABELS,
  PTBA_YEAR_STATUS_TONES,
  QUARTERS,
} from "@/lib/strategy-labels";
import { Badge, EmptyState, PageHeader, ProgressBar, RefBadge, formatAmount, formatDate } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { ActivityForm } from "./activity-form";
import { savePtbaYear, saveActivity } from "./actions";
import { PtbaYearStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "PTBA" };

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function PtbaPage({ searchParams }: PageProps<"/ptba">) {
  const user = await requireUser();
  const editable = can(user.profile, "ptba.manage");
  const sp = await searchParams;

  const years = await db.ptbaYear.findMany({ orderBy: { year: "desc" }, include: { _count: { select: { activities: true } } } });
  const selected = years.find((y) => y.id === str(sp.exercice)) ?? (await defaultPtbaYear());

  const axisFilter = str(sp.axe);
  const directionFilter = str(sp.direction);
  const ownerFilter = str(sp.responsable);
  const statusFilter = str(sp.statut);
  const quarterFilter = str(sp.trimestre);
  const projectFilter = str(sp.projet);
  const q = str(sp.q).trim();

  const where: Prisma.PtbaActivityWhereInput = {
    yearId: selected?.id ?? "",
    ...(q && {
      OR: [
        { code: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ],
    }),
    ...(axisFilter && { result: { objective: { axisId: axisFilter } } }),
    ...(directionFilter && { directionId: directionFilter }),
    ...(ownerFilter && { ownerId: ownerFilter }),
    ...(statusFilter in PTBA_ACTIVITY_STATUS_LABELS && { status: statusFilter as keyof typeof PTBA_ACTIVITY_STATUS_LABELS }),
    ...(quarterFilter && QUARTERS.some((x) => x.key === quarterFilter) ? { [quarterFilter]: true } : {}),
    ...(projectFilter && { projectLinks: { some: { projectId: projectFilter } } }),
  };

  const [activities, axes, results, directions, people, priorities, projects, plans] = await Promise.all([
    selected
      ? db.ptbaActivity.findMany({ where, include: activityInclude, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] })
      : Promise.resolve([]),
    db.strategicAxis.findMany({ orderBy: [{ sortOrder: "asc" }], include: { plan: true } }),
    db.expectedResult.findMany({
      orderBy: [{ code: "asc" }],
      include: { objective: { include: { axis: true } } },
    }),
    db.direction.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { active: true }, orderBy: [{ lastName: "asc" }], select: { id: true, firstName: true, lastName: true } }),
    db.refItem.findMany({ where: { kind: "PRIORITY", active: true }, orderBy: { sortOrder: "asc" } }),
    db.project.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    db.strategicPlan.findMany({ orderBy: { startYear: "desc" } }),
  ]);

  const now = new Date();
  const totals = ptbaTotals(activities, now);
  const peopleOptions = people.map((p) => ({ id: p.id, label: `${p.lastName.toUpperCase()} ${p.firstName}` }));
  const resultOptions = results.map((r) => ({
    id: r.id,
    label: `${r.code} — ${r.description.slice(0, 60)} (${r.objective.axis.code})`,
  }));
  const directionOptions = directions.map((d) => ({ id: d.id, label: d.name }));
  const priorityOptions = priorities.map((p) => ({ id: p.id, label: p.label }));

  return (
    <>
      <PageHeader
        title="PTBA"
        description="Plan de travail et budget annuel : activités rattachées aux résultats attendus et aux projets."
        actions={<Link href="/strategie" className="btn btn-secondary">Référentiel stratégique</Link>}
      />

      {years.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          {years.map((year) => (
            <Link
              key={year.id}
              href={`/ptba?exercice=${year.id}`}
              className={`rounded-lg px-3 py-1.5 ${
                year.id === selected?.id ? "bg-brand-100 font-semibold text-brand-800" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {year.year} <span className="text-xs text-zinc-400">({year._count.activities})</span>
            </Link>
          ))}
          {selected && <Badge tone={PTBA_YEAR_STATUS_TONES[selected.status]}>{PTBA_YEAR_STATUS_LABELS[selected.status]}</Badge>}
        </div>
      )}

      {editable && (
        <details className="card mb-6 p-5" open={years.length === 0}>
          <summary className="cursor-pointer list-none font-semibold text-brand-800">
            {years.length === 0 ? "Créer le premier exercice PTBA" : "+ Nouvel exercice PTBA"}
          </summary>
          <div className="mt-4">
            <ActionForm action={savePtbaYear.bind(null, null)} submitLabel="Créer l’exercice" resetOnSuccess>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Année *</label>
                  <input name="year" type="number" min="2000" max="2100" defaultValue={now.getFullYear()} className="input" />
                </div>
                <div>
                  <label className="label">Intitulé *</label>
                  <input name="label" required defaultValue={`PTBA ${now.getFullYear()}`} className="input" />
                </div>
                <div>
                  <label className="label">Plan stratégique</label>
                  <select name="planId" defaultValue={plans[0]?.id ?? ""} className="input">
                    <option value="">—</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>{p.code}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Statut</label>
                  <select name="status" defaultValue={PtbaYearStatus.PREPARATION} className="input">
                    {Object.entries(PTBA_YEAR_STATUS_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Commentaire</label>
                  <input name="comment" className="input" />
                </div>
              </div>
            </ActionForm>
          </div>
        </details>
      )}

      {!selected ? (
        <div className="card">
          <EmptyState>
            Aucun exercice PTBA. {editable ? "Créez-en un ci-dessus." : "La Direction doit en créer un."}
          </EmptyState>
        </div>
      ) : (
        <>
          <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Activités", totals.count, "text-brand-700"],
              ["Réalisées", totals.done, "text-emerald-600"],
              ["En retard", totals.late, totals.late ? "text-red-600" : "text-brand-700"],
              ["Suspendues", totals.suspended, totals.suspended ? "text-amber-600" : "text-brand-700"],
              ["Taux d’exécution", `${Math.round(totals.executionRate)} %`, "text-brand-700"],
            ].map(([label, value, tone]) => (
              <div key={label as string} className="card p-4">
                <p className="text-sm text-zinc-500">{label}</p>
                <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
              </div>
            ))}
          </section>

          <section className="card mb-6 p-5">
            <h2 className="mb-3 font-semibold text-brand-800">Budget de l’exercice</h2>
            <div className="grid gap-4 sm:grid-cols-4">
              {[
                ["Prévu", formatAmount(totals.budgetPlanned)],
                ["Engagé", formatAmount(totals.budgetCommitted)],
                ["Payé", formatAmount(totals.budgetPaid)],
                ["Solde", formatAmount(totals.budgetPlanned - totals.budgetCommitted - totals.budgetPaid)],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-sm text-zinc-500">{label}</p>
                  <p className="text-lg font-bold text-brand-700">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <p className="mb-1 text-xs text-zinc-500">Taux d’exécution budgétaire</p>
              <ProgressBar value={totals.budgetRate} />
            </div>
          </section>

          <form className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="exercice" value={selected.id} />
            <input name="q" defaultValue={q} placeholder="Rechercher (code, intitulé…)" className="input lg:col-span-2" />
            <select name="axe" defaultValue={axisFilter} className="input" aria-label="Axe">
              <option value="">Tous les axes</option>
              {axes.map((a) => (
                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
              ))}
            </select>
            <select name="direction" defaultValue={directionFilter} className="input" aria-label="Direction">
              <option value="">Toutes les directions</option>
              {directions.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <select name="responsable" defaultValue={ownerFilter} className="input" aria-label="Responsable">
              <option value="">Tous les responsables</option>
              {peopleOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            <select name="statut" defaultValue={statusFilter} className="input" aria-label="Statut">
              <option value="">Tous les statuts</option>
              {Object.entries(PTBA_ACTIVITY_STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <select name="trimestre" defaultValue={quarterFilter} className="input" aria-label="Trimestre">
              <option value="">Tous les trimestres</option>
              {QUARTERS.map((quarter) => (
                <option key={quarter.key} value={quarter.key}>{quarter.label}</option>
              ))}
            </select>
            <select name="projet" defaultValue={projectFilter} className="input" aria-label="Projet">
              <option value="">Tous les projets</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
              ))}
            </select>
            <button className="btn btn-secondary">Filtrer</button>
          </form>

          {editable && selected.status !== "CLOS" && (
            <details className="card mb-6 p-5">
              <summary className="cursor-pointer list-none font-semibold text-brand-800">+ Ajouter une activité PTBA</summary>
              <div className="mt-4">
                <ActivityForm
                  action={saveActivity.bind(null, null)}
                  yearId={selected.id}
                  results={resultOptions}
                  people={peopleOptions}
                  directions={directionOptions}
                  priorities={priorityOptions}
                  submitLabel="Ajouter l’activité"
                  resetOnSuccess
                />
              </div>
            </details>
          )}

          <section className="card overflow-x-auto">
            {activities.length === 0 ? (
              <EmptyState>Aucune activité ne correspond à ces critères.</EmptyState>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Activité</th>
                    <th>Rattachement</th>
                    <th>Responsable</th>
                    <th>Trimestres</th>
                    <th>Échéance</th>
                    <th className="min-w-36">Avancement</th>
                    <th>Budget prévu</th>
                    <th>Exécution</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {activities.map((activity) => {
                    const progress = computeActivityProgress(activity);
                    const budget = activityBudget(activity);
                    const late = isActivityLate(activity, now);
                    return (
                      <tr key={activity.id} className={late ? "bg-red-50/40" : undefined}>
                        <td>
                          <Link href={`/ptba/${activity.id}`} className="font-semibold text-brand-700 hover:underline">
                            {activity.name}
                          </Link>
                          <p className="font-mono text-xs text-zinc-400">{activity.code}</p>
                        </td>
                        <td className="text-xs">
                          {activity.result ? (
                            <>
                              <span className="text-zinc-700">{activity.result.code}</span>
                              <p className="text-zinc-400">{activity.result.objective.axis.code}</p>
                            </>
                          ) : (
                            <span className="text-amber-600">Non rattachée</span>
                          )}
                          {activity.projectLinks.length > 0 && (
                            <p className="text-zinc-400">{activity.projectLinks.length} projet(s)</p>
                          )}
                        </td>
                        <td className="whitespace-nowrap">{activity.owner ? displayName(activity.owner) : "—"}</td>
                        <td className="whitespace-nowrap text-xs">
                          {QUARTERS.filter((quarter) => activity[quarter.key]).map((quarter) => quarter.label).join(" ") || "—"}
                        </td>
                        <td className={`whitespace-nowrap ${late ? "font-semibold text-red-600" : ""}`}>
                          {formatDate(activity.endDate)}
                        </td>
                        <td>
                          <ProgressBar value={progress.value} />
                          <p className="text-[11px] text-zinc-400">{progress.source === "manuel" ? "saisi" : progress.source === "projets" ? "calculé" : "aucun projet"}</p>
                        </td>
                        <td className="whitespace-nowrap">{formatAmount(budget.planned)}</td>
                        <td className="whitespace-nowrap">{Math.round(budget.executionRate)} %</td>
                        <td>
                          <Badge tone={PTBA_ACTIVITY_STATUS_TONES[activity.status]}>
                            {PTBA_ACTIVITY_STATUS_LABELS[activity.status]}
                          </Badge>
                          {activity.priority && <RefBadge item={activity.priority} />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          <p className="mt-4 text-xs text-zinc-500">
            L’avancement est calculé à partir des projets liés, au prorata de leur contribution, sauf si une valeur a
            été saisie manuellement. La liaison aux projets se fait depuis la fiche de l’activité.
          </p>
        </>
      )}
    </>
  );
}
