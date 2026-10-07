import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser, displayName } from "@/lib/auth/session";
import {
  days,
  getOrCreateTimesheet,
  groupHours,
  hoursByDay,
  isEditable,
  recentTimesheets,
  totalHours,
} from "@/lib/timesheets";
import {
  DAY_LABELS,
  TIMESHEET_STATUS_LABELS,
  TIMESHEET_STATUS_TONES,
  formatHours,
  formatWeekRange,
  parseWeekKey,
  shiftWeek,
  weekKey,
} from "@/lib/timesheet-utils";
import { Badge, EmptyState, PageHeader, formatDate } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { deleteTimeEntry, saveTimeEntry, submitTimesheet } from "./actions";
import { TimeEntryForm } from "./entry-form";

export const metadata: Metadata = { title: "Ma fiche de temps" };

export default async function TimesheetPage({ searchParams }: PageProps<"/temps">) {
  const user = await requireUser();
  const sp = await searchParams;
  const now = new Date();
  const weekStart = parseWeekKey(typeof sp.semaine === "string" ? sp.semaine : undefined, now);

  const sheet = await getOrCreateTimesheet(user.id, weekStart);
  const editable = isEditable(sheet.status);

  const [projects, workItems, activities, history] = await Promise.all([
    db.project.findMany({
      where: {
        OR: [{ members: { some: { userId: user.id } } }, { leadId: user.id }, { ownerId: user.id }],
      },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true },
    }),
    db.workItem.findMany({
      where: { project: { members: { some: { userId: user.id } } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, projectId: true, kind: true },
    }),
    db.refItem.findMany({ where: { kind: "ACTIVITY_TYPE", active: true }, orderBy: { sortOrder: "asc" } }),
    recentTimesheets(user.id),
  ]);

  const dayTotals = hoursByDay(sheet.entries, weekStart);
  const total = totalHours(sheet.entries);
  const capacity = Number(user.weeklyCapacityHours);
  const byProject = groupHours(
    sheet.entries,
    (e) => (e.project ? `${e.project.code} — ${e.project.name}` : "Hors projet"),
    (e) => Number(e.hours),
  );

  const formOptions = {
    projects: projects.map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` })),
    workItems: workItems.map((w) => ({ id: w.id, label: w.name, projectId: w.projectId })),
    activities: activities.map((a) => ({ id: a.id, label: a.label })),
    days: days(weekStart).map((day, index) => ({
      value: day.toISOString().slice(0, 10),
      label: `${DAY_LABELS[index]} ${formatDate(day)}`,
    })),
  };

  return (
    <>
      <PageHeader
        title="Ma fiche de temps"
        description={formatWeekRange(weekStart)}
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/temps?semaine=${weekKey(shiftWeek(weekStart, -1))}`} className="btn btn-secondary" aria-label="Semaine précédente">
              <ChevronLeft className="size-4" />
            </Link>
            <Link href="/temps" className="btn btn-secondary">Cette semaine</Link>
            <Link href={`/temps?semaine=${weekKey(shiftWeek(weekStart, 1))}`} className="btn btn-secondary" aria-label="Semaine suivante">
              <ChevronRight className="size-4" />
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Badge tone={TIMESHEET_STATUS_TONES[sheet.status]}>{TIMESHEET_STATUS_LABELS[sheet.status]}</Badge>
        <span className="text-sm text-zinc-600">
          Total saisi : <strong>{formatHours(total)}</strong> sur une capacité de {formatHours(capacity)}
        </span>
        {sheet.reviewer && sheet.reviewedAt && (
          <span className="text-sm text-zinc-500">
            {sheet.status === "VALIDE" ? "Validée" : "Traitée"} par {displayName(sheet.reviewer)} le{" "}
            {formatDate(sheet.reviewedAt)}
          </span>
        )}
      </div>

      {sheet.status === "REJETE" && sheet.reviewComment && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <strong>Fiche rejetée :</strong> {sheet.reviewComment}. Corrigez puis soumettez de nouveau.
        </div>
      )}
      {!editable && sheet.status !== "REJETE" && (
        <div className="mb-4 rounded-lg bg-brand-100 px-4 py-3 text-sm text-brand-800">
          Cette semaine est {TIMESHEET_STATUS_LABELS[sheet.status].toLowerCase()} : la saisie est verrouillée.
          {sheet.status === "VALIDE" && " Demandez à votre responsable de la rouvrir si une correction est nécessaire."}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {dayTotals.map(({ day, hours }, index) => (
          <div key={day.toISOString()} className={`card p-3 ${hours > 0 ? "border-brand-200" : ""}`}>
            <p className="text-xs text-zinc-500">{DAY_LABELS[index]} {formatDate(day)}</p>
            <p className={`text-lg font-bold ${hours > 0 ? "text-brand-700" : "text-zinc-300"}`}>{formatHours(hours)}</p>
          </div>
        ))}
      </div>

      {editable && (
        <section className="card mb-6 p-5">
          <h2 className="mb-4 font-semibold text-brand-800">Ajouter du temps</h2>
          <TimeEntryForm action={saveTimeEntry.bind(null, null)} {...formOptions} submitLabel="Ajouter" resetOnSuccess />
        </section>
      )}

      <section className="card mb-6 overflow-x-auto">
        {sheet.entries.length === 0 ? (
          <EmptyState>Aucune ligne saisie pour cette semaine.</EmptyState>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Jour</th>
                <th>Projet</th>
                <th>Activité du planning</th>
                <th>Type</th>
                <th>Heures</th>
                <th>Commentaire</th>
                {editable && <th />}
              </tr>
            </thead>
            <tbody>
              {sheet.entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap">{formatDate(entry.date)}</td>
                  <td>{entry.project ? `${entry.project.code} — ${entry.project.name}` : <span className="text-zinc-400">Hors projet</span>}</td>
                  <td>{entry.workItem?.name ?? "—"}</td>
                  <td>{entry.activityType.label}</td>
                  <td className="font-medium whitespace-nowrap">{formatHours(Number(entry.hours))}</td>
                  <td className="max-w-64 truncate" title={entry.comment ?? ""}>{entry.comment ?? "—"}</td>
                  {editable && (
                    <td className="relative text-right whitespace-nowrap">
                      <details className="inline-block">
                        <summary className="btn btn-secondary cursor-pointer list-none px-2 py-1 text-xs">Modifier</summary>
                        <div className="absolute right-0 z-10 mt-2 w-[min(52rem,88vw)] space-y-4 rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-lg">
                          <TimeEntryForm
                            action={saveTimeEntry.bind(null, entry.id)}
                            {...formOptions}
                            submitLabel="Enregistrer"
                            values={{
                              date: entry.date.toISOString().slice(0, 10),
                              projectId: entry.projectId,
                              workItemId: entry.workItemId,
                              activityTypeId: entry.activityTypeId,
                              hours: String(entry.hours),
                              comment: entry.comment,
                            }}
                          />
                          <form action={deleteTimeEntry.bind(null, entry.id)} className="border-t border-zinc-100 pt-3">
                            <SubmitButton className="btn btn-danger" pendingLabel="Suppression…" confirm="Supprimer cette ligne ?">
                              Supprimer
                            </SubmitButton>
                          </form>
                        </div>
                      </details>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="text-right font-semibold">Total de la semaine</td>
                <td className="font-bold text-brand-700">{formatHours(total)}</td>
                <td colSpan={editable ? 2 : 1} />
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      {editable && sheet.entries.length > 0 && (
        <form action={submitTimesheet.bind(null, weekKey(weekStart))} className="mb-8">
          <SubmitButton pendingLabel="Envoi…" confirm="Soumettre cette semaine à votre responsable ? La saisie sera verrouillée.">
            Soumettre la semaine ({formatHours(total)})
          </SubmitButton>
          <p className="mt-2 text-xs text-zinc-500">
            {user.manager
              ? `Votre responsable ${displayName(user.manager)} recevra la fiche pour validation.`
              : "Aucun supérieur hiérarchique n’est défini : demandez à l’administrateur de le renseigner."}
          </p>
        </form>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 font-semibold text-brand-800">Répartition de la semaine</h2>
          {byProject.length === 0 ? (
            <p className="text-sm text-zinc-500">Aucune saisie.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {byProject.map((row) => (
                <li key={row.label}>
                  <div className="flex justify-between gap-3">
                    <span className="truncate">{row.label}</span>
                    <span className="font-medium whitespace-nowrap">{formatHours(row.hours)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                    <div className="h-full bg-brand-500" style={{ width: `${total ? (row.hours / total) * 100 : 0}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-3 font-semibold text-brand-800">Mes dernières semaines</h2>
          <ul className="divide-y divide-zinc-100 text-sm">
            {history.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/temps?semaine=${weekKey(item.weekStart)}`} className="text-brand-700 hover:underline">
                  {formatWeekRange(item.weekStart)}
                </Link>
                <span className="flex items-center gap-2">
                  <span className="text-zinc-600">{formatHours(item.total)}</span>
                  <Badge tone={TIMESHEET_STATUS_TONES[item.status]}>{TIMESHEET_STATUS_LABELS[item.status]}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
