import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, displayName } from "@/lib/auth/session";
import { getVisibleProject, projectFields } from "@/lib/projects";
import { projectHealth, HEALTH_TONES } from "@/lib/health";
import { getAlertSettings, getHealthWeights } from "@/lib/settings";
import { buildTree, flattenTree, isLate, milestoneState, workItemInclude } from "@/lib/planning";
import { budgetTotals, isDiligenceLate, kpiAchievement, kpiState, riskLevel, RISK_STATUS_LABELS, isRiskOpen } from "@/lib/monitoring";
import { projectWorkload } from "@/lib/timesheets";
import { formatHours } from "@/lib/timesheet-utils";
import { formatFieldValue } from "@/lib/custom-fields";
import { Badge, ProgressBar, formatAmount, formatDate, formatDateTime } from "@/components/ui";
import { PrintButton } from "../../print-button";

export async function generateMetadata({ params }: PageProps<"/rapports/projet/[id]">) {
  const { id } = await params;
  const project = await db.project.findUnique({ where: { id }, select: { code: true, name: true } });
  return { title: project ? `Rapport ${project.code}` : "Rapport de projet" };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 break-inside-avoid">
      <h2 className="mb-2 border-b border-zinc-200 pb-1 text-base font-semibold text-brand-800">{title}</h2>
      {children}
    </section>
  );
}

export default async function ProjectReportPage({ params }: PageProps<"/rapports/projet/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const project = await getVisibleProject(id, user);
  if (!project) notFound();

  const now = new Date();
  const [weights, alertSettings] = await Promise.all([getHealthWeights(), getAlertSettings()]);
  const [health, items, milestones, kpis, diligences, risks, budgetLines, workload, fields] = await Promise.all([
    projectHealth(id, weights, alertSettings, now),
    db.workItem.findMany({ where: { projectId: id }, include: workItemInclude }),
    db.milestone.findMany({ where: { projectId: id }, orderBy: { dueDate: "asc" } }),
    db.kpi.findMany({ where: { projectId: id }, include: { values: { orderBy: { period: "desc" }, take: 1 } } }),
    db.diligence.findMany({ where: { projectId: id }, include: { owner: true, status: true }, orderBy: { dueDate: "asc" } }),
    db.risk.findMany({ where: { projectId: id }, include: { owner: true, category: true } }),
    db.budgetLine.findMany({ where: { projectId: id } }),
    projectWorkload(id),
    projectFields(project),
  ]);

  const rows = flattenTree(buildTree(items));
  const lateRows = rows.filter((r) => r.children.length === 0 && isLate(r, now));
  const budget = budgetTotals(budgetLines);
  const filledFields = fields.filter((f) => f.value);
  const openRisks = risks.filter((r) => isRiskOpen(r.status));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/rapports" className="text-sm text-brand-600 hover:underline">← Retour aux rapports</Link>
        <PrintButton />
      </div>

      <header className="mb-6 border-b border-zinc-200 pb-4">
        <p className="font-mono text-xs text-zinc-500">{project.code}</p>
        <h1 className="text-2xl font-bold text-brand-800">{project.name}</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Rapport établi le {formatDateTime(now)} par {displayName(user)} · SYNAPSYS
        </p>
      </header>

      <Section title="Synthèse">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Badge tone={HEALTH_TONES[health.color]}>Santé : {health.color} ({Math.round(health.score)}/100)</Badge>
          <span className="text-sm text-zinc-600">Statut : {project.status.label}</span>
          <span className="text-sm text-zinc-600">
            {formatDate(project.startDate)} → {formatDate(project.endDatePlanned)}
          </span>
        </div>
        <ProgressBar value={health.stats.progress} />
        <dl className="mt-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {[
            ["Direction", project.direction?.name ?? "—"],
            ["Chef de projet", project.lead ? displayName(project.lead) : "—"],
            ["Responsable", project.owner ? displayName(project.owner) : "—"],
            ["Sponsor", project.sponsor ? displayName(project.sponsor) : "—"],
            ["Budget prévu", formatAmount(project.budgetPlanned)],
            ["Équipe", `${project.members.length} intervenant(s)`],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-b border-zinc-50 py-0.5">
              <dt className="text-zinc-500">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        {project.description && <p className="mt-3 text-sm whitespace-pre-line text-zinc-700">{project.description}</p>}
      </Section>

      <Section title="Score de santé">
        <table className="data-table">
          <thead>
            <tr><th>Composante</th><th>Poids</th><th>Score</th><th>Détail</th></tr>
          </thead>
          <tbody>
            {health.components.map((component) => (
              <tr key={component.key}>
                <td>{component.label}</td>
                <td>{component.weight} %</td>
                <td>{component.score === null ? "non évalué" : `${Math.round(component.score)}/100`}</td>
                <td className="text-zinc-500">{component.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Avancement et planning">
        <p className="mb-2 text-sm text-zinc-600">
          {rows.length} élément(s) de planning, dont {lateRows.length} en retard.
        </p>
        {rows.length > 0 && (
          <table className="data-table">
            <thead>
              <tr><th>Élément</th><th>Responsable</th><th>Fin</th><th>Avancement</th></tr>
            </thead>
            <tbody>
              {rows.slice(0, 25).map((row) => (
                <tr key={row.id}>
                  <td style={{ paddingLeft: `${row.depth * 14 + 16}px` }}>{row.name}</td>
                  <td>{row.owner ? displayName(row.owner) : "—"}</td>
                  <td className={isLate(row, now) ? "font-semibold text-red-600" : ""}>{formatDate(row.endDate)}</td>
                  <td>{Math.round(Number(row.progress))} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Jalons">
        {milestones.length === 0 ? (
          <p className="text-sm text-zinc-500">Aucun jalon.</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Jalon</th><th>Prévu</th><th>Réel</th><th>État</th></tr></thead>
            <tbody>
              {milestones.map((milestone) => {
                const state = milestoneState(milestone, now);
                return (
                  <tr key={milestone.id}>
                    <td>{milestone.name}</td>
                    <td>{formatDate(milestone.dueDate)}</td>
                    <td>{formatDate(milestone.actualDate)}</td>
                    <td><Badge tone={state.tone}>{state.label}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Indicateurs">
        {kpis.length === 0 ? (
          <p className="text-sm text-zinc-500">Aucun indicateur défini.</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Indicateur</th><th>Cible</th><th>Valeur</th><th>Taux</th><th>État</th></tr></thead>
            <tbody>
              {kpis.map((kpi) => {
                const latest = kpi.values[0];
                const rate = kpiAchievement(kpi, latest?.value ?? null);
                const state = kpiState(rate, kpi);
                return (
                  <tr key={kpi.id}>
                    <td>{kpi.name}</td>
                    <td>{kpi.target === null ? "—" : `${kpi.target}${kpi.unit ? ` ${kpi.unit}` : ""}`}</td>
                    <td>{latest ? `${latest.value}${kpi.unit ? ` ${kpi.unit}` : ""}` : "—"}</td>
                    <td>{rate === null ? "—" : `${Math.round(rate)} %`}</td>
                    <td><Badge tone={state.tone}>{state.label}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Risques et problèmes">
        {risks.length === 0 ? (
          <p className="text-sm text-zinc-500">Aucun risque enregistré.</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Intitulé</th><th>Criticité</th><th>Responsable</th><th>Statut</th><th>Mitigation</th></tr></thead>
            <tbody>
              {risks.map((risk) => {
                const level = riskLevel(risk.probability, risk.impact);
                return (
                  <tr key={risk.id}>
                    <td>{risk.title}</td>
                    <td><Badge tone={level.tone}>{level.label} ({level.score})</Badge></td>
                    <td>{risk.owner ? displayName(risk.owner) : "—"}</td>
                    <td>{RISK_STATUS_LABELS[risk.status]}</td>
                    <td className="text-zinc-500">{risk.mitigationPlan ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Diligences">
        {diligences.length === 0 ? (
          <p className="text-sm text-zinc-500">Aucune diligence.</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Action</th><th>Responsable</th><th>Échéance</th><th>Statut</th></tr></thead>
            <tbody>
              {diligences.map((diligence) => (
                <tr key={diligence.id}>
                  <td>{diligence.title}</td>
                  <td>{diligence.owner ? displayName(diligence.owner) : "—"}</td>
                  <td className={isDiligenceLate(diligence, now) ? "font-semibold text-red-600" : ""}>
                    {formatDate(diligence.dueDate)}
                  </td>
                  <td>{diligence.status.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Budget et ressources">
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {[
            ["Budget initial", formatAmount(budget.initial)],
            ["Budget révisé", formatAmount(budget.revised)],
            ["Engagements", formatAmount(budget.committed)],
            ["Dépenses réalisées", formatAmount(budget.spent)],
            ["Taux de consommation", `${Math.round(budget.consumptionRate)} %`],
            ["Reste disponible", formatAmount(budget.available)],
            ["Temps prévu", formatHours(workload.planned)],
            ["Temps consommé", formatHours(workload.consumed)],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-b border-zinc-50 py-0.5">
              <dt className="text-zinc-500">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {filledFields.length > 0 && (
        <Section title="Rubriques du projet">
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {filledFields.map(({ definition, value }) => (
              <div key={definition.id} className="flex justify-between gap-4 border-b border-zinc-50 py-0.5">
                <dt className="text-zinc-500">{definition.label}</dt>
                <dd className="font-medium">{formatFieldValue(definition, value)}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      <Section title="Difficultés et recommandations">
        <ul className="list-inside list-disc text-sm text-zinc-700">
          {lateRows.length > 0 && <li>{lateRows.length} élément(s) de planning en retard à replanifier.</li>}
          {health.stats.lateMilestones > 0 && <li>{health.stats.lateMilestones} jalon(s) dépassé(s).</li>}
          {health.stats.lateDiligences > 0 && <li>{health.stats.lateDiligences} diligence(s) en retard à relancer.</li>}
          {openRisks.length > 0 && <li>{health.stats.criticalRisks} risque(s) critique(s) ouvert(s) sur {openRisks.length} risque(s) suivis.</li>}
          {health.stats.kpiOff > 0 && <li>{health.stats.kpiOff} indicateur(s) non atteint(s).</li>}
          {budget.consumptionRate > alertSettings.budgetThreshold && (
            <li>Budget consommé à {Math.round(budget.consumptionRate)} %, au-delà du seuil d’alerte.</li>
          )}
          {lateRows.length === 0 &&
            health.stats.lateMilestones === 0 &&
            health.stats.lateDiligences === 0 &&
            health.stats.criticalRisks === 0 &&
            health.stats.kpiOff === 0 && <li>Aucun point de blocage identifié automatiquement.</li>}
        </ul>
        <p className="mt-3 text-xs text-zinc-500">
          Ces points sont déduits des données saisies. Complétez-les à l’oral ou dans le compte rendu du comité.
        </p>
      </Section>
    </div>
  );
}
