import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { visibleProjectsWhere } from "@/lib/projects";
import { projectHealth, HEALTH_TONES } from "@/lib/health";
import { getAlertSettings, getHealthWeights } from "@/lib/settings";
import { totalHours } from "@/lib/timesheets";
import { formatHours } from "@/lib/timesheet-utils";
import { Badge, EmptyState, PageHeader, ProgressBar, RefBadge, formatAmount, formatDate } from "@/components/ui";

export const metadata: Metadata = { title: "Tableau de bord" };

export default async function DashboardPage() {
  const user = await requireUser();
  const [weights, alerts] = await Promise.all([getHealthWeights(), getAlertSettings()]);
  const now = new Date();

  const projects = await db.project.findMany({
    where: visibleProjectsWhere(user),
    include: { status: true, direction: true, lead: true },
    orderBy: { updatedAt: "desc" },
  });

  const health = await Promise.all(
    projects.map(async (project) => ({ project, health: await projectHealth(project.id, weights, alerts, now) })),
  );

  const isClosed = (meta: unknown) => (meta as { closed?: boolean } | null)?.closed === true;
  const isFinished = (meta: unknown) => (meta as { finished?: boolean } | null)?.finished === true;
  const open = health.filter((h) => !isClosed(h.project.status.meta));
  const late = open.filter(
    (h) => h.project.endDatePlanned && h.project.endDatePlanned < now && !h.project.endDateActual,
  );
  const atRisk = open.filter((h) => h.health.color !== "VERT");

  const totals = health.reduce(
    (acc, h) => ({
      budget: acc.budget + h.health.stats.budgetPlanned,
      spent: acc.spent + h.health.stats.budgetSpent,
      hours: acc.hours + h.health.stats.hoursConsumed,
      kpiOk: acc.kpiOk + h.health.stats.kpiOk,
      kpiOff: acc.kpiOff + h.health.stats.kpiOff,
      kpiTotal: acc.kpiTotal + h.health.stats.kpiTotal,
      lateMilestones: acc.lateMilestones + h.health.stats.lateMilestones,
      lateItems: acc.lateItems + h.health.stats.lateItems,
      lateDiligences: acc.lateDiligences + h.health.stats.lateDiligences,
      criticalRisks: acc.criticalRisks + h.health.stats.criticalRisks,
    }),
    { budget: 0, spent: 0, hours: 0, kpiOk: 0, kpiOff: 0, kpiTotal: 0, lateMilestones: 0, lateItems: 0, lateDiligences: 0, criticalRisks: 0 },
  );

  const averageProgress = open.length ? open.reduce((sum, h) => sum + h.health.stats.progress, 0) / open.length : 0;
  const consumptionRate = totals.budget > 0 ? (totals.spent / totals.budget) * 100 : 0;

  const [people, entries] = await Promise.all([
    db.user.count({ where: { active: true } }),
    db.timeEntry.findMany({
      where: { date: { gte: new Date(now.getTime() - 30 * 86_400_000) } },
      include: { project: { select: { code: true, name: true } } },
    }),
  ]);

  const byProject = new Map<string, number>();
  for (const entry of entries) {
    const key = entry.project ? `${entry.project.code} — ${entry.project.name}` : "Hors projet";
    byProject.set(key, (byProject.get(key) ?? 0) + Number(entry.hours));
  }
  const topProjects = [...byProject.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const monthHours = totalHours(entries);

  // Répartition des projets par statut
  const byStatus = new Map<string, { label: string; color: string | null; count: number }>();
  for (const { project } of health) {
    const current = byStatus.get(project.statusId) ?? { label: project.status.label, color: project.status.color, count: 0 };
    current.count += 1;
    byStatus.set(project.statusId, current);
  }

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        description="Vision consolidée du portefeuille, selon vos droits d’accès."
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Projets", projects.length, "text-brand-700"],
          ["En cours", open.filter((h) => !isFinished(h.project.status.meta)).length, "text-brand-700"],
          ["En retard", late.length, late.length ? "text-red-600" : "text-brand-700"],
          ["À risque", atRisk.length, atRisk.length ? "text-amber-600" : "text-brand-700"],
          ["Avancement moyen", `${Math.round(averageProgress)} %`, "text-brand-700"],
        ].map(([label, value, tone]) => (
          <div key={label as string} className="card p-4">
            <p className="text-sm text-zinc-500">{label}</p>
            <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
          </div>
        ))}
      </section>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <section className="card p-5">
          <h2 className="mb-3 font-semibold text-brand-800">Finances</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-zinc-500">Budget suivi</dt><dd className="font-medium">{formatAmount(totals.budget)}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Dépenses</dt><dd className="font-medium">{formatAmount(totals.spent)}</dd></div>
          </dl>
          <div className="mt-3">
            <p className="mb-1 text-xs text-zinc-500">Taux de consommation</p>
            <ProgressBar value={consumptionRate} />
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 font-semibold text-brand-800">Ressources</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-zinc-500">Intervenants actifs</dt><dd className="font-medium">{people}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Heures saisies (30 j)</dt><dd className="font-medium">{formatHours(monthHours)}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Heures consommées (total)</dt><dd className="font-medium">{formatHours(totals.hours)}</dd></div>
          </dl>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 font-semibold text-brand-800">Performance</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-zinc-500">Indicateurs suivis</dt><dd className="font-medium">{totals.kpiTotal}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Atteints</dt><dd className="font-medium text-emerald-600">{totals.kpiOk}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Non atteints</dt><dd className="font-medium text-red-600">{totals.kpiOff}</dd></div>
          </dl>
        </section>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 font-semibold text-brand-800">Points d’attention</h2>
          <ul className="space-y-2 text-sm">
            {[
              ["Jalons dépassés", totals.lateMilestones],
              ["Tâches en retard", totals.lateItems],
              ["Diligences en retard", totals.lateDiligences],
              ["Risques critiques ouverts", totals.criticalRisks],
            ].map(([label, count]) => (
              <li key={label as string} className="flex items-center justify-between gap-3">
                <span>{label}</span>
                {Number(count) > 0 ? <Badge tone="red">{count}</Badge> : <span className="text-emerald-600">0</span>}
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 font-semibold text-brand-800">Projets par statut</h2>
          {byStatus.size === 0 ? (
            <p className="text-sm text-zinc-500">Aucun projet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {[...byStatus.values()]
                .sort((a, b) => b.count - a.count)
                .map((row) => (
                  <li key={row.label}>
                    <div className="flex justify-between gap-3">
                      <RefBadge item={{ label: row.label, color: row.color }} />
                      <span className="font-medium">{row.count}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className="h-full"
                        style={{ width: `${(row.count / projects.length) * 100}%`, background: row.color ?? "#624da0" }}
                      />
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>

      {topProjects.length > 0 && (
        <section className="card mb-6 p-5">
          <h2 className="mb-3 font-semibold text-brand-800">Temps consacré aux projets (30 derniers jours)</h2>
          <ul className="space-y-2 text-sm">
            {topProjects.map(([label, hours]) => (
              <li key={label}>
                <div className="flex justify-between gap-3">
                  <span className="truncate">{label}</span>
                  <span className="font-medium whitespace-nowrap">{formatHours(hours)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                  <div className="h-full bg-brand-500" style={{ width: `${monthHours ? (hours / monthHours) * 100 : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card overflow-x-auto">
        <h2 className="px-5 pt-5 pb-3 font-semibold text-brand-800">Santé des projets</h2>
        {health.length === 0 ? (
          <EmptyState>Aucun projet visible.</EmptyState>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Projet</th>
                <th>Statut</th>
                <th>Échéance</th>
                <th className="min-w-32">Avancement</th>
                <th>Budget</th>
                <th>Score</th>
                <th>Santé</th>
              </tr>
            </thead>
            <tbody>
              {health
                .sort((a, b) => a.health.score - b.health.score)
                .map(({ project, health: h }) => (
                  <tr key={project.id}>
                    <td>
                      <Link href={`/projets/${project.id}`} className="font-semibold text-brand-700 hover:underline">
                        {project.name}
                      </Link>
                      <p className="font-mono text-xs text-zinc-400">
                        {project.code}
                        {project.direction && ` · ${project.direction.name}`}
                      </p>
                    </td>
                    <td><RefBadge item={project.status} /></td>
                    <td className="whitespace-nowrap">{formatDate(project.endDatePlanned)}</td>
                    <td><ProgressBar value={h.stats.progress} /></td>
                    <td className="whitespace-nowrap">
                      {h.stats.budgetPlanned > 0 ? `${Math.round(h.stats.budgetRate)} %` : "—"}
                    </td>
                    <td className="font-bold whitespace-nowrap">{Math.round(h.score)}/100</td>
                    <td><Badge tone={HEALTH_TONES[h.color]}>{h.color}</Badge></td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="mt-4 text-xs text-zinc-500">
        Score de santé pondéré : planning {weights.planning} %, budget {weights.budget} %, avancement {weights.progress} %,
        risques {weights.risks} %, indicateurs {weights.kpi} %, ressources {weights.resources} %. Vert à partir de{" "}
        {alerts.greenFrom}, rouge en dessous de {alerts.redBelow}. Ces paramètres se modifient dans
        Administration → Paramètres.
      </p>
    </>
  );
}
