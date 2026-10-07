import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { isLate, milestoneState } from "@/lib/planning";
import { isDiligenceLate } from "@/lib/monitoring";
import { maybeRunAlertScan, NOTIFICATION_TONES } from "@/lib/alerts";
import { getOrCreateTimesheet, isEditable, totalHours } from "@/lib/timesheets";
import { formatHours, formatWeekRange, weekKey, weekStartOf } from "@/lib/timesheet-utils";
import { Badge, EmptyState, PageHeader, ProgressBar, RefBadge, formatDate } from "@/components/ui";

export const metadata: Metadata = { title: "Mes actions" };

export default async function MyActionsPage() {
  const user = await requireUser();
  const now = new Date();
  await maybeRunAlertScan(now);

  const [tasks, diligences, milestones, projects, notifications, pendingReviews] = await Promise.all([
    db.workItem.findMany({
      where: {
        OR: [{ ownerId: user.id }, { assignees: { some: { userId: user.id } } }],
        children: { none: {} },
      },
      include: { project: { select: { id: true, code: true, name: true } }, status: true },
      orderBy: [{ endDate: "asc" }],
    }),
    db.diligence.findMany({
      where: { ownerId: user.id },
      include: { project: { select: { id: true, code: true } }, status: true, priority: true },
      orderBy: [{ dueDate: "asc" }],
    }),
    db.milestone.findMany({
      where: { OR: [{ ownerId: user.id }, { project: { OR: [{ leadId: user.id }, { ownerId: user.id }] } }], status: "PREVU" },
      include: { project: { select: { id: true, code: true } } },
      orderBy: { dueDate: "asc" },
      take: 8,
    }),
    db.project.findMany({
      where: {
        OR: [{ leadId: user.id }, { ownerId: user.id }, { members: { some: { userId: user.id } } }],
      },
      include: { status: true },
      orderBy: { updatedAt: "desc" },
    }),
    db.notification.findMany({
      where: { userId: user.id, readAt: null },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    db.timesheet.count({ where: { status: "SOUMIS", user: { managerId: user.id } } }),
  ]);

  const openTasks = tasks.filter((t) => (t.status?.meta as { done?: boolean } | null)?.done !== true && Number(t.progress) < 100);
  const openDiligences = diligences.filter((d) => (d.status.meta as { done?: boolean } | null)?.done !== true);
  const sheet = await getOrCreateTimesheet(user.id, weekStartOf(now));
  const sheetTotal = totalHours(sheet.entries);

  return (
    <>
      <PageHeader title="Mes actions" description="Votre page de travail quotidienne." />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Mes tâches ouvertes", openTasks.length, openTasks.filter((t) => isLate(t, now)).length, "en retard"],
          ["Mes diligences", openDiligences.length, openDiligences.filter((d) => isDiligenceLate(d, now)).length, "en retard"],
          ["Mes projets", projects.length, 0, ""],
          ["Alertes non lues", notifications.length, notifications.filter((n) => n.level === "CRITIQUE").length, "critique(s)"],
          ["Fiches à valider", pendingReviews, 0, ""],
        ].map(([label, count, lateCount, suffix]) => (
          <div key={label as string} className="card p-4">
            <p className="text-sm text-zinc-500">{label}</p>
            <p className="mt-1 text-2xl font-bold text-brand-700">{count}</p>
            {Number(lateCount) > 0 && <p className="text-xs font-semibold text-red-600">dont {lateCount} {suffix}</p>}
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card overflow-x-auto">
          <h2 className="px-5 pt-5 pb-3 font-semibold text-brand-800">Mes tâches</h2>
          {openTasks.length === 0 ? (
            <EmptyState>Aucune tâche en cours ne vous est affectée.</EmptyState>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tâche</th>
                  <th>Échéance</th>
                  <th>Statut</th>
                  <th className="min-w-28">Avancement</th>
                </tr>
              </thead>
              <tbody>
                {openTasks.slice(0, 10).map((task) => {
                  const late = isLate(task, now);
                  return (
                    <tr key={task.id} className={late ? "bg-red-50/40" : undefined}>
                      <td>
                        <Link href={`/projets/${task.project.id}/planification`} className="font-medium text-brand-700 hover:underline">
                          {task.name}
                        </Link>
                        <p className="font-mono text-xs text-zinc-400">{task.project.code}</p>
                      </td>
                      <td className={`whitespace-nowrap ${late ? "font-semibold text-red-600" : ""}`}>
                        {formatDate(task.endDate)}
                      </td>
                      <td><RefBadge item={task.status} /></td>
                      <td><ProgressBar value={Number(task.progress)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <section className="card overflow-x-auto">
          <h2 className="px-5 pt-5 pb-3 font-semibold text-brand-800">Mes diligences</h2>
          {openDiligences.length === 0 ? (
            <EmptyState>Aucune diligence à votre nom.</EmptyState>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Échéance</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {openDiligences.slice(0, 10).map((diligence) => {
                  const late = isDiligenceLate(diligence, now);
                  return (
                    <tr key={diligence.id} className={late ? "bg-red-50/40" : undefined}>
                      <td>
                        <Link href={`/projets/${diligence.project.id}/diligences`} className="font-medium text-brand-700 hover:underline">
                          {diligence.title}
                        </Link>
                        <p className="font-mono text-xs text-zinc-400">{diligence.project.code}</p>
                      </td>
                      <td className={`whitespace-nowrap ${late ? "font-semibold text-red-600" : ""}`}>
                        {formatDate(diligence.dueDate)}
                      </td>
                      <td><RefBadge item={diligence.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-3 font-semibold text-brand-800">Ma fiche de temps</h2>
          <p className="text-sm text-zinc-600">
            Semaine du {formatWeekRange(sheet.weekStart)} — <strong>{formatHours(sheetTotal)}</strong> saisies.
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            {isEditable(sheet.status)
              ? "La fiche est encore modifiable."
              : "La fiche est soumise ou validée."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/temps?semaine=${weekKey(sheet.weekStart)}`} className="btn btn-primary">Ouvrir ma fiche</Link>
            {pendingReviews > 0 && (
              <Link href="/temps/validation" className="btn btn-secondary">
                Valider {pendingReviews} fiche(s)
              </Link>
            )}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 font-semibold text-brand-800">Mes prochaines échéances</h2>
          {milestones.length === 0 ? (
            <p className="text-sm text-zinc-500">Aucun jalon à venir.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {milestones.map((milestone) => {
                const state = milestoneState(milestone, now);
                return (
                  <li key={milestone.id} className="flex items-center justify-between gap-3">
                    <Link href={`/projets/${milestone.project.id}/jalons`} className="truncate text-brand-700 hover:underline">
                      {milestone.name}
                    </Link>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-zinc-500">{formatDate(milestone.dueDate)}</span>
                      <Badge tone={state.tone}>{state.label}</Badge>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-brand-800">Mes alertes</h2>
            <Link href="/notifications" className="text-sm text-brand-600 hover:underline">Tout voir</Link>
          </div>
          {notifications.length === 0 ? (
            <p className="text-sm text-zinc-500">Aucune alerte en attente.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 text-sm">
              {notifications.map((notification) => (
                <li key={notification.id} className="flex items-start justify-between gap-3 py-2">
                  <span>
                    <Badge tone={NOTIFICATION_TONES[notification.level]}>{notification.level}</Badge>{" "}
                    {notification.link ? (
                      <Link href={notification.link} className="font-medium text-brand-700 hover:underline">
                        {notification.title}
                      </Link>
                    ) : (
                      <span className="font-medium">{notification.title}</span>
                    )}
                    {notification.body && <p className="text-xs text-zinc-500">{notification.body}</p>}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-400">{formatDate(notification.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
