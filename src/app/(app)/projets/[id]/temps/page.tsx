import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { getVisibleProject } from "@/lib/projects";
import { driftAlert, projectWorkload } from "@/lib/timesheets";
import { formatHours } from "@/lib/timesheet-utils";
import { EmptyState, ProgressBar, formatDate } from "@/components/ui";

export default async function ProjectTimePage({ params }: PageProps<"/projets/[id]/temps">) {
  const user = await requireUser();
  const { id } = await params;
  const project = await getVisibleProject(id, user);
  if (!project) notFound();

  const workload = await projectWorkload(id);
  const progress = Number(project.progress);
  const drift = driftAlert(workload.planned, workload.consumed, progress);

  const lastEntries = await db.timeEntry.findMany({
    where: { projectId: id },
    include: { user: true, activityType: true, workItem: true, timesheet: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 15,
  });

  const rate = workload.planned > 0 ? (workload.consumed / workload.planned) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Temps prévu", formatHours(workload.planned)],
          ["Temps consommé", formatHours(workload.consumed)],
          ["Dont validé", formatHours(workload.validated)],
          ["Écart", formatHours(workload.planned - workload.consumed)],
        ].map(([label, value]) => (
          <div key={label} className="card p-4">
            <p className="text-sm text-zinc-500">{label}</p>
            <p className="mt-1 text-2xl font-bold text-brand-700">{value}</p>
          </div>
        ))}
      </div>

      <section className="card p-5">
        <h2 className="mb-3 font-semibold text-brand-800">Consommation et avancement</h2>
        <div className="space-y-3 text-sm">
          <div>
            <p className="mb-1 text-zinc-500">Taux de consommation du temps</p>
            <ProgressBar value={rate} />
          </div>
          <div>
            <p className="mb-1 text-zinc-500">Avancement du projet</p>
            <ProgressBar value={progress} />
          </div>
        </div>
        {drift && (
          <div className="mt-4 flex items-start gap-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <span>
              <strong>Risque de dérive :</strong> {drift.message}
            </span>
          </div>
        )}
        <p className="mt-4 text-xs text-zinc-500">
          Le temps prévu retient la valeur la plus élevée entre les charges de l’équipe
          ({formatHours(workload.plannedFromTeam)}) et celles du planning ({formatHours(workload.plannedFromPlanning)}).
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card overflow-x-auto">
          <h2 className="px-5 pt-5 pb-3 font-semibold text-brand-800">Par intervenant</h2>
          {workload.byPerson.length === 0 ? (
            <EmptyState>Aucun temps saisi sur ce projet.</EmptyState>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Intervenant</th>
                  <th>Prévu</th>
                  <th>Consommé</th>
                  <th>Écart</th>
                </tr>
              </thead>
              <tbody>
                {workload.byPerson.map((person) => (
                  <tr key={person.userId}>
                    <td>{person.name}</td>
                    <td className="whitespace-nowrap">{person.planned ? formatHours(person.planned) : "—"}</td>
                    <td className="whitespace-nowrap">{formatHours(person.consumed)}</td>
                    <td
                      className={`whitespace-nowrap ${
                        person.planned > 0 && person.consumed > person.planned ? "font-semibold text-red-600" : ""
                      }`}
                    >
                      {person.planned ? formatHours(person.planned - person.consumed) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-3 font-semibold text-brand-800">Par type d’activité</h2>
          {workload.byActivity.length === 0 ? (
            <p className="text-sm text-zinc-500">Aucune saisie.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {workload.byActivity.map((row) => (
                <li key={row.label}>
                  <div className="flex justify-between gap-3">
                    <span>{row.label}</span>
                    <span className="font-medium">{formatHours(row.hours)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-full bg-brand-500"
                      style={{ width: `${workload.consumed ? (row.hours / workload.consumed) * 100 : 0}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card overflow-x-auto">
        <h2 className="px-5 pt-5 pb-3 font-semibold text-brand-800">Dernières saisies</h2>
        {lastEntries.length === 0 ? (
          <EmptyState>Aucune saisie de temps sur ce projet.</EmptyState>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Intervenant</th>
                <th>Activité du planning</th>
                <th>Type</th>
                <th>Heures</th>
                <th>Commentaire</th>
              </tr>
            </thead>
            <tbody>
              {lastEntries.map((entry) => (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap">{formatDate(entry.date)}</td>
                  <td className="whitespace-nowrap">{entry.user.firstName} {entry.user.lastName}</td>
                  <td>{entry.workItem?.name ?? "—"}</td>
                  <td>{entry.activityType.label}</td>
                  <td className="whitespace-nowrap">{formatHours(Number(entry.hours))}</td>
                  <td className="max-w-64 truncate" title={entry.comment ?? ""}>{entry.comment ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
