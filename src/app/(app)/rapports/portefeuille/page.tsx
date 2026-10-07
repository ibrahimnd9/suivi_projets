import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, displayName } from "@/lib/auth/session";
import { visibleProjectsWhere } from "@/lib/projects";
import { projectHealth, HEALTH_TONES } from "@/lib/health";
import { getAlertSettings, getHealthWeights } from "@/lib/settings";
import { formatHours } from "@/lib/timesheet-utils";
import { Badge, EmptyState, formatAmount, formatDate, formatDateTime } from "@/components/ui";
import { PrintButton } from "../print-button";

export const metadata: Metadata = { title: "Rapport de portefeuille" };

export default async function PortfolioReportPage() {
  const user = await requireUser();
  const now = new Date();
  const [weights, alerts] = await Promise.all([getHealthWeights(), getAlertSettings()]);

  const projects = await db.project.findMany({
    where: visibleProjectsWhere(user),
    include: { status: true, direction: true, lead: true },
    orderBy: { code: "asc" },
  });

  const health = await Promise.all(
    projects.map(async (project) => ({ project, health: await projectHealth(project.id, weights, alerts, now) })),
  );

  const totals = health.reduce(
    (acc, h) => ({
      budget: acc.budget + h.health.stats.budgetPlanned,
      spent: acc.spent + h.health.stats.budgetSpent,
      hours: acc.hours + h.health.stats.hoursConsumed,
      lateMilestones: acc.lateMilestones + h.health.stats.lateMilestones,
      lateDiligences: acc.lateDiligences + h.health.stats.lateDiligences,
      criticalRisks: acc.criticalRisks + h.health.stats.criticalRisks,
    }),
    { budget: 0, spent: 0, hours: 0, lateMilestones: 0, lateDiligences: 0, criticalRisks: 0 },
  );
  const averageProgress = health.length ? health.reduce((s, h) => s + h.health.stats.progress, 0) / health.length : 0;
  const late = health.filter((h) => h.project.endDatePlanned && h.project.endDatePlanned < now && !h.project.endDateActual);
  const red = health.filter((h) => h.health.color === "ROUGE");

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/rapports" className="text-sm text-brand-600 hover:underline">← Retour aux rapports</Link>
        <PrintButton />
      </div>

      <header className="mb-6 border-b border-zinc-200 pb-4">
        <h1 className="text-2xl font-bold text-brand-800">Rapport de portefeuille</h1>
        <p className="mt-1 text-sm text-zinc-600">
          SYNAPSYS · établi le {formatDateTime(now)} par {displayName(user)} · {projects.length} projet(s)
        </p>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Projets", projects.length],
          ["En retard", late.length],
          ["En rouge", red.length],
          ["Avancement moyen", `${Math.round(averageProgress)} %`],
          ["Budget suivi", formatAmount(totals.budget)],
          ["Heures consommées", formatHours(totals.hours)],
        ].map(([label, value]) => (
          <div key={label as string} className="card p-3">
            <p className="text-xs text-zinc-500">{label}</p>
            <p className="text-lg font-bold text-brand-700">{value}</p>
          </div>
        ))}
      </section>

      <section className="mb-6">
        <h2 className="mb-2 border-b border-zinc-200 pb-1 text-base font-semibold text-brand-800">État des projets</h2>
        {health.length === 0 ? (
          <EmptyState>Aucun projet visible.</EmptyState>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Projet</th>
                <th>Direction</th>
                <th>Chef de projet</th>
                <th>Statut</th>
                <th>Fin prévue</th>
                <th>Avancement</th>
                <th>Budget</th>
                <th>Santé</th>
              </tr>
            </thead>
            <tbody>
              {health.map(({ project, health: h }) => (
                <tr key={project.id}>
                  <td className="font-mono text-xs">{project.code}</td>
                  <td>{project.name}</td>
                  <td>{project.direction?.name ?? "—"}</td>
                  <td>{project.lead ? displayName(project.lead) : "—"}</td>
                  <td>{project.status.label}</td>
                  <td className={late.some((l) => l.project.id === project.id) ? "font-semibold text-red-600" : ""}>
                    {formatDate(project.endDatePlanned)}
                  </td>
                  <td>{Math.round(h.stats.progress)} %</td>
                  <td>{h.stats.budgetPlanned > 0 ? `${Math.round(h.stats.budgetRate)} %` : "—"}</td>
                  <td><Badge tone={HEALTH_TONES[h.color]}>{h.color}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mb-6">
        <h2 className="mb-2 border-b border-zinc-200 pb-1 text-base font-semibold text-brand-800">
          Points nécessitant une décision
        </h2>
        <ul className="list-inside list-disc text-sm text-zinc-700">
          {red.map(({ project, health: h }) => (
            <li key={project.id}>
              {project.code} — {project.name} : score {Math.round(h.score)}/100
              {h.stats.criticalRisks > 0 && `, ${h.stats.criticalRisks} risque(s) critique(s)`}
              {h.stats.lateMilestones > 0 && `, ${h.stats.lateMilestones} jalon(s) dépassé(s)`}.
            </li>
          ))}
          {totals.lateDiligences > 0 && <li>{totals.lateDiligences} diligence(s) en retard sur l’ensemble du portefeuille.</li>}
          {totals.criticalRisks > 0 && <li>{totals.criticalRisks} risque(s) critique(s) ouverts au total.</li>}
          {red.length === 0 && totals.lateDiligences === 0 && totals.criticalRisks === 0 && (
            <li>Aucun point critique détecté sur le portefeuille.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
