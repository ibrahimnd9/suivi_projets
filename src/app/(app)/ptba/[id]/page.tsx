import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, displayName } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { activityBudget, activityInclude, computeActivityProgress, isActivityLate, linkedProjectSpending } from "@/lib/ptba";
import {
  PTBA_ACTIVITY_STATUS_LABELS,
  PTBA_ACTIVITY_STATUS_TONES,
  PTBA_YEAR_STATUS_LABELS,
  QUARTERS,
} from "@/lib/strategy-labels";
import { auditAction } from "@/lib/audit-labels";
import { Badge, EmptyState, PageHeader, ProgressBar, RefBadge, formatAmount, formatDate, formatDateTime } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ActivityForm } from "../activity-form";
import { deleteActivity, saveActivity, setActivityStatus } from "../actions";

export async function generateMetadata({ params }: PageProps<"/ptba/[id]">) {
  const { id } = await params;
  const activity = await db.ptbaActivity.findUnique({ where: { id }, select: { code: true, name: true } });
  return { title: activity ? `${activity.code} — ${activity.name}` : "Activité PTBA" };
}

const asInputDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function PtbaActivityPage({ params }: PageProps<"/ptba/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const activity = await db.ptbaActivity.findUnique({ where: { id }, include: activityInclude });
  if (!activity) notFound();

  const editable = can(user.profile, "ptba.manage") && activity.year.status !== "CLOS";
  const now = new Date();
  const progress = computeActivityProgress(activity);
  const budget = activityBudget(activity);
  const late = isActivityLate(activity, now);

  const [results, people, directions, priorities, history, projectSpending] = await Promise.all([
    db.expectedResult.findMany({ orderBy: { code: "asc" }, include: { objective: { include: { axis: true } } } }),
    db.user.findMany({ where: { active: true }, orderBy: [{ lastName: "asc" }], select: { id: true, firstName: true, lastName: true } }),
    db.direction.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.refItem.findMany({ where: { kind: "PRIORITY", active: true }, orderBy: { sortOrder: "asc" } }),
    db.auditLog.findMany({ where: { entity: "Activité PTBA", entityId: id }, orderBy: { createdAt: "desc" }, take: 10 }),
    linkedProjectSpending(id),
  ]);

  const natures: [string, number][] = [
    ["Ressources humaines", Number(activity.budgetHr)],
    ["Prestations", Number(activity.budgetServices)],
    ["Investissements", Number(activity.budgetInvestment)],
    ["Fonctionnement", Number(activity.budgetOperating)],
  ];

  return (
    <>
      <PageHeader
        title={activity.name}
        description={`${activity.code} · ${activity.year.label} (${PTBA_YEAR_STATUS_LABELS[activity.year.status]})`}
        actions={<Link href={`/ptba?exercice=${activity.yearId}`} className="btn btn-secondary">Retour au PTBA</Link>}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge tone={PTBA_ACTIVITY_STATUS_TONES[activity.status]}>{PTBA_ACTIVITY_STATUS_LABELS[activity.status]}</Badge>
        {activity.priority && <RefBadge item={activity.priority} />}
        {late && <Badge tone="red">En retard</Badge>}
        <span className="text-sm text-zinc-500">
          {formatDate(activity.startDate)} → {formatDate(activity.endDate)}
          {activity.direction && ` · ${activity.direction.name}`}
        </span>
        {editable && (
          <form action={setActivityStatus.bind(null, activity.id)} className="ml-auto flex items-center gap-2">
            <select name="status" defaultValue={activity.status} className="input w-48 py-1" aria-label="Changer le statut">
              {Object.entries(PTBA_ACTIVITY_STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <SubmitButton className="btn btn-secondary px-2 py-1 text-xs" pendingLabel="…">Appliquer</SubmitButton>
          </form>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="mb-3 font-semibold text-brand-800">Identification</h2>
            {activity.description && <p className="mb-4 text-sm whitespace-pre-line text-zinc-700">{activity.description}</p>}
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {[
                ["Axe stratégique", activity.result ? `${activity.result.objective.axis.code} — ${activity.result.objective.axis.name}` : "—"],
                ["Objectif", activity.result ? `${activity.result.objective.code} — ${activity.result.objective.name}` : "—"],
                ["Résultat attendu", activity.result ? `${activity.result.code} — ${activity.result.description}` : "Non rattachée"],
                ["Responsable", activity.owner ? displayName(activity.owner) : "—"],
                ["Direction", activity.direction?.name ?? "—"],
                ["Trimestres", QUARTERS.filter((q) => activity[q.key]).map((q) => q.label).join(", ") || "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 border-b border-zinc-50 py-1">
                  <dt className="text-zinc-500">{label}</dt>
                  <dd className="text-right font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            {activity.participants.length > 0 && (
              <p className="mt-3 text-sm text-zinc-600">
                Participants : {activity.participants.map((p) => displayName(p.user)).join(", ")}
              </p>
            )}
          </section>

          <section className="card p-6">
            <h2 className="mb-3 font-semibold text-brand-800">Avancement</h2>
            <ProgressBar value={progress.value} />
            <p className="mt-2 text-sm text-zinc-600">
              {progress.source === "manuel" && "Valeur saisie manuellement."}
              {progress.source === "projets" &&
                `Calculé à partir de ${activity.projectLinks.length} projet(s) lié(s), au prorata de leur contribution.`}
              {progress.source === "aucun" && "Aucun projet lié : rattachez un projet ou saisissez l’avancement."}
              {activity.progressComment && ` ${activity.progressComment}`}
            </p>
          </section>

          <section className="card p-6">
            <h2 className="mb-3 font-semibold text-brand-800">Budget</h2>
            <div className="grid gap-4 sm:grid-cols-4">
              {[
                ["Prévu", formatAmount(budget.planned)],
                ["Engagé", formatAmount(budget.committed)],
                ["Payé", formatAmount(budget.paid)],
                ["Solde", formatAmount(budget.balance)],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-sm text-zinc-500">{label}</p>
                  <p className="text-lg font-bold text-brand-700">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <p className="mb-1 text-xs text-zinc-500">Taux d’exécution budgétaire</p>
              <ProgressBar value={budget.executionRate} />
            </div>
            <table className="data-table mt-4">
              <thead>
                <tr><th>Nature de dépense</th><th>Montant prévu</th><th>Part</th></tr>
              </thead>
              <tbody>
                {natures.map(([label, value]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td className="whitespace-nowrap">{formatAmount(value)}</td>
                    <td>{budget.planned > 0 ? `${Math.round((value / budget.planned) * 100)} %` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {projectSpending > 0 && (
              <p className="mt-3 text-sm text-zinc-600">
                Dépenses des projets liés, au prorata de leur contribution : <strong>{formatAmount(projectSpending)}</strong>.
              </p>
            )}
          </section>

          {editable && (
            <section className="card p-6">
              <h2 className="mb-4 font-semibold text-brand-800">Modifier l’activité</h2>
              <ActivityForm
                action={saveActivity.bind(null, activity.id)}
                yearId={activity.yearId}
                submitLabel="Enregistrer"
                results={results.map((r) => ({
                  id: r.id,
                  label: `${r.code} — ${r.description.slice(0, 60)} (${r.objective.axis.code})`,
                }))}
                people={people.map((p) => ({ id: p.id, label: `${p.lastName.toUpperCase()} ${p.firstName}` }))}
                directions={directions.map((d) => ({ id: d.id, label: d.name }))}
                priorities={priorities.map((p) => ({ id: p.id, label: p.label }))}
                values={{
                  code: activity.code,
                  name: activity.name,
                  description: activity.description,
                  resultId: activity.resultId,
                  ownerId: activity.ownerId,
                  directionId: activity.directionId,
                  startDate: asInputDate(activity.startDate),
                  endDate: asInputDate(activity.endDate),
                  priorityId: activity.priorityId,
                  status: activity.status,
                  progressManual: activity.progressManual === null ? null : String(activity.progressManual),
                  progressComment: activity.progressComment,
                  q1: activity.q1,
                  q2: activity.q2,
                  q3: activity.q3,
                  q4: activity.q4,
                  budgetHr: String(activity.budgetHr),
                  budgetServices: String(activity.budgetServices),
                  budgetInvestment: String(activity.budgetInvestment),
                  budgetOperating: String(activity.budgetOperating),
                  committed: String(activity.committed),
                  paid: String(activity.paid),
                  sortOrder: activity.sortOrder,
                  participants: activity.participants.map((p) => p.userId),
                }}
              />
              <form action={deleteActivity.bind(null, activity.id)} className="mt-4 border-t border-zinc-100 pt-4">
                <SubmitButton
                  className="btn btn-danger"
                  pendingLabel="Suppression…"
                  confirm={`Supprimer l’activité « ${activity.code} — ${activity.name} » ?`}
                >
                  Supprimer l’activité
                </SubmitButton>
              </form>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="mb-3 font-semibold text-brand-800">Projets contributeurs ({activity.projectLinks.length})</h2>
            {activity.projectLinks.length === 0 ? (
              <EmptyState>
                Aucun projet lié. Le rattachement des projets arrive à l’étape suivante.
              </EmptyState>
            ) : (
              <ul className="space-y-3 text-sm">
                {activity.projectLinks.map((link) => (
                  <li key={link.id}>
                    <div className="flex items-center justify-between gap-3">
                      <Link href={`/projets/${link.projectId}`} className="font-medium text-brand-700 hover:underline">
                        {link.project.code}
                      </Link>
                      <span className="text-zinc-500">{Number(link.contribution)} %</span>
                    </div>
                    <p className="text-xs text-zinc-500">{link.project.name}</p>
                    <ProgressBar value={Number(link.project.progress)} className="mt-1" />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-6">
            <h2 className="mb-3 font-semibold text-brand-800">Historique</h2>
            {history.length === 0 ? (
              <p className="text-sm text-zinc-500">Aucune modification enregistrée.</p>
            ) : (
              <ol className="space-y-3 text-sm">
                {history.map((entry) => (
                  <li key={entry.id} className="border-l-2 border-brand-200 pl-3">
                    <p className="text-xs text-zinc-500">
                      {formatDateTime(entry.createdAt)} · {entry.userName ?? "Système"}
                    </p>
                    <p>
                      {entry.field ? (
                        <>
                          <span className="font-medium">{entry.field}</span> : {entry.oldValue ?? "—"} → {entry.newValue ?? "—"}
                        </>
                      ) : (
                        auditAction(entry.action).label
                      )}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
