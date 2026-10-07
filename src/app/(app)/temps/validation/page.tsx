import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireUser, displayName } from "@/lib/auth/session";
import { groupHours, totalHours } from "@/lib/timesheets";
import {
  TIMESHEET_STATUS_LABELS,
  TIMESHEET_STATUS_TONES,
  formatHours,
  formatWeekRange,
} from "@/lib/timesheet-utils";
import { Badge, EmptyState, PageHeader, formatDate, formatDateTime } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { reopenTimesheet, reviewTimesheet } from "../actions";

export const metadata: Metadata = { title: "Validation des temps" };

export default async function TimesheetReviewPage() {
  const user = await requireUser();
  const isAdmin = user.profile === "ADMIN";

  const teamFilter = isAdmin ? { id: { not: user.id } } : { managerId: user.id };
  const [pending, recent, team] = await Promise.all([
    db.timesheet.findMany({
      where: { status: "SOUMIS", user: teamFilter },
      include: { user: true, entries: { include: { project: true, activityType: true } } },
      orderBy: { weekStart: "asc" },
    }),
    db.timesheet.findMany({
      where: { status: { in: ["VALIDE", "REJETE"] }, user: teamFilter },
      include: { user: true, entries: { select: { hours: true } } },
      orderBy: { reviewedAt: "desc" },
      take: 10,
    }),
    db.user.findMany({ where: { ...teamFilter, active: true }, orderBy: { lastName: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Validation des temps"
        description={
          isAdmin
            ? "En tant qu’administrateur, vous pouvez valider toutes les fiches."
            : `${team.length} collaborateur(s) rattaché(s) à vous.`
        }
      />

      {team.length === 0 && !isAdmin ? (
        <div className="card">
          <EmptyState>
            Aucun collaborateur ne vous est rattaché. Le rattachement (N+1) se définit dans la fiche de chaque
            utilisateur.
          </EmptyState>
        </div>
      ) : (
        <>
          <section className="mb-8">
            <h2 className="mb-3 font-semibold text-brand-800">
              À valider {pending.length > 0 && <Badge tone="amber">{pending.length}</Badge>}
            </h2>
            {pending.length === 0 ? (
              <div className="card"><EmptyState>Aucune fiche en attente de validation.</EmptyState></div>
            ) : (
              <div className="space-y-4">
                {pending.map((sheet) => {
                  const total = totalHours(sheet.entries);
                  const byProject = groupHours(
                    sheet.entries,
                    (e) => (e.project ? `${e.project.code} — ${e.project.name}` : "Hors projet"),
                    (e) => Number(e.hours),
                  );
                  return (
                    <article key={sheet.id} className="card p-5">
                      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-brand-800">{displayName(sheet.user)}</h3>
                          <p className="text-sm text-zinc-500">
                            {formatWeekRange(sheet.weekStart)} · soumise le {formatDateTime(sheet.submittedAt)}
                          </p>
                        </div>
                        <span className="text-lg font-bold text-brand-700">{formatHours(total)}</span>
                      </header>

                      <div className="mb-4 overflow-x-auto">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Jour</th>
                              <th>Projet</th>
                              <th>Type</th>
                              <th>Heures</th>
                              <th>Commentaire</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sheet.entries.map((entry) => (
                              <tr key={entry.id}>
                                <td className="whitespace-nowrap">{formatDate(entry.date)}</td>
                                <td>{entry.project ? `${entry.project.code} — ${entry.project.name}` : "Hors projet"}</td>
                                <td>{entry.activityType.label}</td>
                                <td className="whitespace-nowrap">{formatHours(Number(entry.hours))}</td>
                                <td>{entry.comment ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <p className="mb-4 text-sm text-zinc-500">
                        Répartition : {byProject.map((row) => `${row.label} (${formatHours(row.hours)})`).join(" · ")}
                      </p>

                      <div className="grid gap-3 lg:grid-cols-2">
                        <ActionForm action={reviewTimesheet.bind(null, sheet.id, "VALIDE")} submitLabel="Valider la fiche">
                          <input name="comment" placeholder="Commentaire (facultatif)" className="input" />
                        </ActionForm>
                        <ActionForm action={reviewTimesheet.bind(null, sheet.id, "REJETE")} submitLabel="Rejeter">
                          <input name="comment" placeholder="Motif du rejet (obligatoire)" className="input" />
                        </ActionForm>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 font-semibold text-brand-800">Fiches traitées récemment</h2>
            <div className="card overflow-x-auto">
              {recent.length === 0 ? (
                <EmptyState>Aucune fiche traitée pour le moment.</EmptyState>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Personne</th>
                      <th>Semaine</th>
                      <th>Total</th>
                      <th>Statut</th>
                      <th>Traitée le</th>
                      <th>Commentaire</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((sheet) => (
                      <tr key={sheet.id}>
                        <td>{displayName(sheet.user)}</td>
                        <td className="whitespace-nowrap">{formatWeekRange(sheet.weekStart)}</td>
                        <td className="whitespace-nowrap">{formatHours(totalHours(sheet.entries))}</td>
                        <td><Badge tone={TIMESHEET_STATUS_TONES[sheet.status]}>{TIMESHEET_STATUS_LABELS[sheet.status]}</Badge></td>
                        <td className="whitespace-nowrap">{formatDateTime(sheet.reviewedAt)}</td>
                        <td className="max-w-64 truncate" title={sheet.reviewComment ?? ""}>{sheet.reviewComment ?? "—"}</td>
                        <td className="text-right">
                          {sheet.status === "VALIDE" && (
                            <form action={reopenTimesheet.bind(null, sheet.id)}>
                              <SubmitButton
                                className="btn btn-secondary px-2 py-1 text-xs"
                                pendingLabel="…"
                                confirm="Rouvrir cette fiche validée pour correction ?"
                              >
                                Rouvrir
                              </SubmitButton>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}
