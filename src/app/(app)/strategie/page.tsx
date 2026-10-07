import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, displayName } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { STRATEGIC_STATUS_LABELS, STRATEGIC_STATUS_TONES } from "@/lib/strategy-labels";
import { KPI_FREQUENCY_LABELS } from "@/lib/monitoring";
import { Badge, EmptyState, PageHeader, formatAmount, formatDate } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { deleteStrategyNode, saveAxis, saveObjective, savePlan, saveResult } from "./actions";
import { KpiFrequency, StrategicStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Référentiel stratégique" };

const asInputDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
type Option = { id: string; label: string };

function StatusSelect({ value }: { value?: StrategicStatus }) {
  return (
    <select name="status" defaultValue={value ?? StrategicStatus.EN_COURS} className="input">
      {Object.entries(STRATEGIC_STATUS_LABELS).map(([key, label]) => (
        <option key={key} value={key}>{label}</option>
      ))}
    </select>
  );
}

function PeopleSelect({ people, value }: { people: Option[]; value?: string | null }) {
  return (
    <select name="ownerId" defaultValue={value ?? ""} className="input">
      <option value="">—</option>
      {people.map((p) => (
        <option key={p.id} value={p.id}>{p.label}</option>
      ))}
    </select>
  );
}

export default async function StrategyPage({ searchParams }: PageProps<"/strategie">) {
  const user = await requireUser();
  const editable = can(user.profile, "strategy.manage");
  const sp = await searchParams;

  const [plans, people, refAxes] = await Promise.all([
    db.strategicPlan.findMany({
      orderBy: { startYear: "desc" },
      include: {
        _count: { select: { ptbaYears: true } },
        axes: {
          orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
          include: {
            owner: true,
            refItem: true,
            objectives: {
              orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
              include: {
                owner: true,
                results: {
                  orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
                  include: { owner: true, _count: { select: { activities: true } } },
                },
              },
            },
          },
        },
      },
    }),
    db.user.findMany({
      where: { active: true },
      orderBy: [{ lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
    db.refItem.findMany({ where: { kind: "STRATEGIC_AXIS" }, orderBy: { sortOrder: "asc" } }),
  ]);

  const peopleOptions: Option[] = people.map((p) => ({ id: p.id, label: `${p.lastName.toUpperCase()} ${p.firstName}` }));
  const currentPlan = plans.find((p) => p.id === sp.plan) ?? plans[0];
  const axes = currentPlan?.axes ?? [];
  const objectives = axes.flatMap((a) => a.objectives);
  const results = objectives.flatMap((o) => o.results);
  const linkedActivities = results.reduce((sum, r) => sum + r._count.activities, 0);

  return (
    <>
      <PageHeader
        title="Référentiel stratégique"
        description="Plan stratégique → axes → objectifs → résultats attendus. Les activités PTBA se rattachent aux résultats."
        actions={
          <Link href="/ptba" className="btn btn-secondary">Aller au PTBA</Link>
        }
      />

      {plans.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          {plans.map((plan) => (
            <Link
              key={plan.id}
              href={`/strategie?plan=${plan.id}`}
              className={`rounded-lg px-3 py-1.5 ${
                plan.id === currentPlan?.id ? "bg-brand-100 font-semibold text-brand-800" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {plan.code} ({plan.startYear}-{plan.endYear})
            </Link>
          ))}
        </div>
      )}

      {editable && (
        <details className="card mb-6 p-5" open={plans.length === 0}>
          <summary className="cursor-pointer list-none font-semibold text-brand-800">
            {plans.length === 0 ? "Créer le plan stratégique" : "+ Nouveau plan stratégique"}
          </summary>
          <div className="mt-4">
            <ActionForm action={savePlan.bind(null, null)} submitLabel="Créer" resetOnSuccess>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Code *</label>
                  <input name="code" required placeholder="PSD-2026-2030" className="input uppercase" />
                </div>
                <div>
                  <label className="label">Intitulé *</label>
                  <input name="name" required placeholder="Plan stratégique de développement" className="input" />
                </div>
                <div>
                  <label className="label">Année de début *</label>
                  <input name="startYear" type="number" min="2000" max="2100" defaultValue={new Date().getFullYear()} className="input" />
                </div>
                <div>
                  <label className="label">Année de fin *</label>
                  <input name="endYear" type="number" min="2000" max="2100" defaultValue={new Date().getFullYear() + 4} className="input" />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Vision</label>
                  <textarea name="vision" rows={2} className="input" />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Mission</label>
                  <textarea name="mission" rows={2} className="input" />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Orientations stratégiques</label>
                  <textarea name="orientations" rows={2} className="input" />
                </div>
              </div>
            </ActionForm>
          </div>
        </details>
      )}

      {!currentPlan ? (
        <div className="card">
          <EmptyState>
            Aucun plan stratégique. {editable ? "Créez-en un ci-dessus pour démarrer la chaîne de résultats." : "Contactez la Direction."}
          </EmptyState>
        </div>
      ) : (
        <>
          <section className="card mb-6 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs text-zinc-400">{currentPlan.code}</p>
                <h2 className="text-xl font-bold text-brand-800">{currentPlan.name}</h2>
                <p className="text-sm text-zinc-500">
                  Période {currentPlan.startYear}-{currentPlan.endYear} · {currentPlan._count.ptbaYears} exercice(s) PTBA rattaché(s)
                </p>
              </div>
              {editable && (
                <details className="relative">
                  <summary className="btn btn-secondary cursor-pointer list-none px-2 py-1 text-xs">Modifier</summary>
                  <div className="absolute right-0 z-10 mt-2 w-[min(40rem,85vw)] rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
                    <ActionForm action={savePlan.bind(null, currentPlan.id)}>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="label">Code *</label>
                          <input name="code" defaultValue={currentPlan.code} required className="input uppercase" />
                        </div>
                        <div>
                          <label className="label">Intitulé *</label>
                          <input name="name" defaultValue={currentPlan.name} required className="input" />
                        </div>
                        <div>
                          <label className="label">Année de début *</label>
                          <input name="startYear" type="number" defaultValue={currentPlan.startYear} className="input" />
                        </div>
                        <div>
                          <label className="label">Année de fin *</label>
                          <input name="endYear" type="number" defaultValue={currentPlan.endYear} className="input" />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="label">Vision</label>
                          <textarea name="vision" rows={2} defaultValue={currentPlan.vision ?? ""} className="input" />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="label">Mission</label>
                          <textarea name="mission" rows={2} defaultValue={currentPlan.mission ?? ""} className="input" />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="label">Orientations stratégiques</label>
                          <textarea name="orientations" rows={2} defaultValue={currentPlan.orientations ?? ""} className="input" />
                        </div>
                      </div>
                    </ActionForm>
                  </div>
                </details>
              )}
            </div>
            {(currentPlan.vision || currentPlan.mission || currentPlan.orientations) && (
              <dl className="mt-4 space-y-2 text-sm">
                {currentPlan.vision && (
                  <div><dt className="font-medium text-zinc-700">Vision</dt><dd className="whitespace-pre-line text-zinc-600">{currentPlan.vision}</dd></div>
                )}
                {currentPlan.mission && (
                  <div><dt className="font-medium text-zinc-700">Mission</dt><dd className="whitespace-pre-line text-zinc-600">{currentPlan.mission}</dd></div>
                )}
                {currentPlan.orientations && (
                  <div><dt className="font-medium text-zinc-700">Orientations</dt><dd className="whitespace-pre-line text-zinc-600">{currentPlan.orientations}</dd></div>
                )}
              </dl>
            )}
          </section>

          <div className="mb-6 grid gap-4 sm:grid-cols-4">
            {[
              ["Axes", axes.length],
              ["Objectifs", objectives.length],
              ["Résultats attendus", results.length],
              ["Activités PTBA rattachées", linkedActivities],
            ].map(([label, value]) => (
              <div key={label as string} className="card p-4">
                <p className="text-sm text-zinc-500">{label}</p>
                <p className="mt-1 text-2xl font-bold text-brand-700">{value}</p>
              </div>
            ))}
          </div>

          {editable && (
            <details className="card mb-6 p-5">
              <summary className="cursor-pointer list-none font-semibold text-brand-800">+ Ajouter un axe stratégique</summary>
              <div className="mt-4">
                <ActionForm action={saveAxis.bind(null, null)} submitLabel="Ajouter" resetOnSuccess>
                  <input type="hidden" name="planId" value={currentPlan.id} />
                  <input type="hidden" name="sortOrder" value={(axes.length + 1) * 10} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label">Code *</label>
                      <input name="code" required placeholder="AXE-01" className="input uppercase" />
                    </div>
                    <div>
                      <label className="label">Intitulé *</label>
                      <input name="name" required className="input" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label">Description</label>
                      <textarea name="description" rows={2} className="input" />
                    </div>
                    <div>
                      <label className="label">Responsable</label>
                      <PeopleSelect people={peopleOptions} />
                    </div>
                    <div>
                      <label className="label">Statut</label>
                      <StatusSelect />
                    </div>
                    <div>
                      <label className="label">Date de début</label>
                      <input name="startDate" type="date" className="input" />
                    </div>
                    <div>
                      <label className="label">Date de fin</label>
                      <input name="endDate" type="date" className="input" />
                    </div>
                    <div>
                      <label className="label">Enveloppe budgétaire</label>
                      <input name="budget" inputMode="decimal" className="input" />
                    </div>
                    <div>
                      <label className="label">Axe correspondant du référentiel projets</label>
                      <select name="refItemId" className="input">
                        <option value="">—</option>
                        {refAxes.map((r) => (
                          <option key={r.id} value={r.id}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </ActionForm>
              </div>
            </details>
          )}

          {axes.length === 0 ? (
            <div className="card"><EmptyState>Aucun axe stratégique dans ce plan.</EmptyState></div>
          ) : (
            <div className="space-y-6">
              {axes.map((axis) => (
                <section key={axis.id} className="card relative p-5">
                  <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 pb-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="brand">{axis.code}</Badge>
                        <h3 className="font-semibold text-brand-800">{axis.name}</h3>
                        <Badge tone={STRATEGIC_STATUS_TONES[axis.status]}>{STRATEGIC_STATUS_LABELS[axis.status]}</Badge>
                      </div>
                      {axis.description && <p className="mt-1 text-sm text-zinc-600">{axis.description}</p>}
                      <p className="mt-1 text-xs text-zinc-500">
                        {axis.owner ? displayName(axis.owner) : "Responsable non désigné"}
                        {axis.budget && ` · ${formatAmount(axis.budget)}`}
                        {axis.startDate && ` · ${formatDate(axis.startDate)} → ${formatDate(axis.endDate)}`}
                        {axis.refItem && ` · référentiel projets : ${axis.refItem.label}`}
                      </p>
                    </div>
                    {editable && (
                      <div className="flex items-center gap-2">
                        <details>
                          <summary className="btn btn-secondary cursor-pointer list-none px-2 py-1 text-xs">Modifier</summary>
                          <div className="absolute right-4 z-10 mt-2 w-[min(44rem,85vw)] space-y-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
                            <ActionForm action={saveAxis.bind(null, axis.id)}>
                              <input type="hidden" name="planId" value={currentPlan.id} />
                              <input type="hidden" name="sortOrder" value={axis.sortOrder} />
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                  <label className="label">Code *</label>
                                  <input name="code" defaultValue={axis.code} required className="input uppercase" />
                                </div>
                                <div>
                                  <label className="label">Intitulé *</label>
                                  <input name="name" defaultValue={axis.name} required className="input" />
                                </div>
                                <div className="sm:col-span-2">
                                  <label className="label">Description</label>
                                  <textarea name="description" rows={2} defaultValue={axis.description ?? ""} className="input" />
                                </div>
                                <div>
                                  <label className="label">Responsable</label>
                                  <PeopleSelect people={peopleOptions} value={axis.ownerId} />
                                </div>
                                <div>
                                  <label className="label">Statut</label>
                                  <StatusSelect value={axis.status} />
                                </div>
                                <div>
                                  <label className="label">Date de début</label>
                                  <input name="startDate" type="date" defaultValue={asInputDate(axis.startDate)} className="input" />
                                </div>
                                <div>
                                  <label className="label">Date de fin</label>
                                  <input name="endDate" type="date" defaultValue={asInputDate(axis.endDate)} className="input" />
                                </div>
                                <div>
                                  <label className="label">Enveloppe budgétaire</label>
                                  <input name="budget" inputMode="decimal" defaultValue={axis.budget?.toString() ?? ""} className="input" />
                                </div>
                                <div>
                                  <label className="label">Axe correspondant du référentiel projets</label>
                                  <select name="refItemId" defaultValue={axis.refItemId ?? ""} className="input">
                                    <option value="">—</option>
                                    {refAxes.map((r) => (
                                      <option key={r.id} value={r.id}>{r.label}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            </ActionForm>
                            {axis.objectives.length === 0 && (
                              <form action={deleteStrategyNode.bind(null, "axe", axis.id)} className="border-t border-zinc-100 pt-3">
                                <SubmitButton className="btn btn-danger" pendingLabel="…" confirm={`Supprimer l’axe « ${axis.name} » ?`}>
                                  Supprimer
                                </SubmitButton>
                              </form>
                            )}
                          </div>
                        </details>
                      </div>
                    )}
                  </header>

                  {axis.objectives.length === 0 ? (
                    <p className="text-sm text-zinc-500">Aucun objectif rattaché à cet axe.</p>
                  ) : (
                    <ul className="space-y-4">
                      {axis.objectives.map((objective) => (
                        <li key={objective.id} className="rounded-lg border border-zinc-100 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-xs text-zinc-500">{objective.code}</span>
                                <span className="font-medium">{objective.name}</span>
                                <Badge tone={STRATEGIC_STATUS_TONES[objective.status]}>{STRATEGIC_STATUS_LABELS[objective.status]}</Badge>
                              </div>
                              {objective.description && <p className="mt-1 text-sm text-zinc-600">{objective.description}</p>}
                              <p className="text-xs text-zinc-500">
                                {objective.owner ? displayName(objective.owner) : "Responsable non désigné"}
                                {objective.budget && ` · ${formatAmount(objective.budget)}`}
                              </p>
                            </div>
                            {editable && (
                              <details className="relative">
                                <summary className="btn btn-secondary cursor-pointer list-none px-2 py-1 text-xs">Modifier</summary>
                                <div className="absolute right-0 z-10 mt-2 w-[min(40rem,85vw)] space-y-4 rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-lg">
                                  <ActionForm action={saveObjective.bind(null, objective.id)}>
                                    <input type="hidden" name="axisId" value={axis.id} />
                                    <input type="hidden" name="sortOrder" value={objective.sortOrder} />
                                    <div className="grid gap-3 sm:grid-cols-2">
                                      <div>
                                        <label className="label">Code *</label>
                                        <input name="code" defaultValue={objective.code} required className="input uppercase" />
                                      </div>
                                      <div>
                                        <label className="label">Intitulé *</label>
                                        <input name="name" defaultValue={objective.name} required className="input" />
                                      </div>
                                      <div className="sm:col-span-2">
                                        <label className="label">Description</label>
                                        <textarea name="description" rows={2} defaultValue={objective.description ?? ""} className="input" />
                                      </div>
                                      <div>
                                        <label className="label">Responsable</label>
                                        <PeopleSelect people={peopleOptions} value={objective.ownerId} />
                                      </div>
                                      <div>
                                        <label className="label">Statut</label>
                                        <StatusSelect value={objective.status} />
                                      </div>
                                      <div>
                                        <label className="label">Budget</label>
                                        <input name="budget" inputMode="decimal" defaultValue={objective.budget?.toString() ?? ""} className="input" />
                                      </div>
                                    </div>
                                  </ActionForm>
                                  {objective.results.length === 0 && (
                                    <form action={deleteStrategyNode.bind(null, "objectif", objective.id)} className="border-t border-zinc-100 pt-3">
                                      <SubmitButton className="btn btn-danger" pendingLabel="…" confirm={`Supprimer l’objectif « ${objective.name} » ?`}>
                                        Supprimer
                                      </SubmitButton>
                                    </form>
                                  )}
                                </div>
                              </details>
                            )}
                          </div>

                          {objective.results.length > 0 && (
                            <ul className="mt-3 space-y-2 border-t border-zinc-100 pt-3">
                              {objective.results.map((result) => (
                                <li key={result.id} className="relative flex flex-wrap items-start justify-between gap-3 text-sm">
                                  <div>
                                    <span className="font-mono text-xs text-zinc-500">{result.code}</span>{" "}
                                    <span>{result.description}</span>
                                    <p className="text-xs text-zinc-500">
                                      {KPI_FREQUENCY_LABELS[result.frequency]}
                                      {result.verification && ` · source : ${result.verification}`}
                                      {` · ${result._count.activities} activité(s) PTBA`}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge tone={STRATEGIC_STATUS_TONES[result.status]}>{STRATEGIC_STATUS_LABELS[result.status]}</Badge>
                                    {editable && (
                                      <details>
                                        <summary className="btn btn-secondary cursor-pointer list-none px-2 py-0.5 text-xs">Modifier</summary>
                                        <div className="absolute right-0 z-10 mt-2 w-[min(36rem,85vw)] space-y-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
                                          <ActionForm action={saveResult.bind(null, result.id)}>
                                            <input type="hidden" name="objectiveId" value={objective.id} />
                                            <input type="hidden" name="sortOrder" value={result.sortOrder} />
                                            <div className="grid gap-3 sm:grid-cols-2">
                                              <div>
                                                <label className="label">Code *</label>
                                                <input name="code" defaultValue={result.code} required className="input uppercase" />
                                              </div>
                                              <div>
                                                <label className="label">État</label>
                                                <StatusSelect value={result.status} />
                                              </div>
                                              <div className="sm:col-span-2">
                                                <label className="label">Description *</label>
                                                <textarea name="description" rows={2} defaultValue={result.description} required className="input" />
                                              </div>
                                              <div>
                                                <label className="label">Responsable</label>
                                                <PeopleSelect people={peopleOptions} value={result.ownerId} />
                                              </div>
                                              <div>
                                                <label className="label">Fréquence de mesure</label>
                                                <select name="frequency" defaultValue={result.frequency} className="input">
                                                  {Object.entries(KPI_FREQUENCY_LABELS).map(([key, label]) => (
                                                    <option key={key} value={key}>{label}</option>
                                                  ))}
                                                </select>
                                              </div>
                                              <div className="sm:col-span-2">
                                                <label className="label">Source de vérification</label>
                                                <input name="verification" defaultValue={result.verification ?? ""} className="input" />
                                              </div>
                                            </div>
                                          </ActionForm>
                                          {result._count.activities === 0 && (
                                            <form action={deleteStrategyNode.bind(null, "resultat", result.id)} className="border-t border-zinc-100 pt-3">
                                              <SubmitButton className="btn btn-danger" pendingLabel="…" confirm={`Supprimer le résultat « ${result.code} » ?`}>
                                                Supprimer
                                              </SubmitButton>
                                            </form>
                                          )}
                                        </div>
                                      </details>
                                    )}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}

                          {editable && (
                            <details className="mt-3 border-t border-zinc-100 pt-3">
                              <summary className="cursor-pointer list-none text-sm text-brand-600">+ Ajouter un résultat attendu</summary>
                              <div className="mt-3">
                                <ActionForm action={saveResult.bind(null, null)} submitLabel="Ajouter" resetOnSuccess>
                                  <input type="hidden" name="objectiveId" value={objective.id} />
                                  <input type="hidden" name="sortOrder" value={(objective.results.length + 1) * 10} />
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <div>
                                      <label className="label">Code *</label>
                                      <input name="code" required placeholder={`${objective.code}.1`} className="input uppercase" />
                                    </div>
                                    <div>
                                      <label className="label">État</label>
                                      <StatusSelect value={StrategicStatus.PREVU} />
                                    </div>
                                    <div className="sm:col-span-2">
                                      <label className="label">Description *</label>
                                      <textarea name="description" rows={2} required className="input" />
                                    </div>
                                    <div>
                                      <label className="label">Responsable</label>
                                      <PeopleSelect people={peopleOptions} />
                                    </div>
                                    <div>
                                      <label className="label">Fréquence de mesure</label>
                                      <select name="frequency" defaultValue={KpiFrequency.TRIMESTRIELLE} className="input">
                                        {Object.entries(KPI_FREQUENCY_LABELS).map(([key, label]) => (
                                          <option key={key} value={key}>{label}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="sm:col-span-2">
                                      <label className="label">Source de vérification</label>
                                      <input name="verification" placeholder="Rapport trimestriel, tableau de bord…" className="input" />
                                    </div>
                                  </div>
                                </ActionForm>
                              </div>
                            </details>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {editable && (
                    <details className="mt-4 border-t border-zinc-100 pt-3">
                      <summary className="cursor-pointer list-none text-sm text-brand-600">+ Ajouter un objectif à cet axe</summary>
                      <div className="mt-3">
                        <ActionForm action={saveObjective.bind(null, null)} submitLabel="Ajouter" resetOnSuccess>
                          <input type="hidden" name="axisId" value={axis.id} />
                          <input type="hidden" name="sortOrder" value={(axis.objectives.length + 1) * 10} />
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label className="label">Code *</label>
                              <input name="code" required placeholder={`${axis.code}.1`} className="input uppercase" />
                            </div>
                            <div>
                              <label className="label">Intitulé *</label>
                              <input name="name" required className="input" />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="label">Description</label>
                              <textarea name="description" rows={2} className="input" />
                            </div>
                            <div>
                              <label className="label">Responsable</label>
                              <PeopleSelect people={peopleOptions} />
                            </div>
                            <div>
                              <label className="label">Statut</label>
                              <StatusSelect />
                            </div>
                            <div>
                              <label className="label">Budget</label>
                              <input name="budget" inputMode="decimal" className="input" />
                            </div>
                          </div>
                        </ActionForm>
                      </div>
                    </details>
                  )}
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
