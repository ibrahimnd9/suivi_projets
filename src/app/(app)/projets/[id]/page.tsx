import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, displayName } from "@/lib/auth/session";
import { PROJECT_ROLE_LABELS } from "@/lib/auth/permissions";
import { getVisibleProject, projectFields } from "@/lib/projects";
import { formatFieldValue } from "@/lib/custom-fields";
import { auditAction } from "@/lib/audit-labels";
import { isDiligenceLate, isRiskOpen, kpiAchievement, kpiState, riskLevel } from "@/lib/monitoring";
import { milestoneState } from "@/lib/planning";
import { Badge, formatAmount, formatDate, formatDateTime } from "@/components/ui";

export default async function ProjectSummaryPage({ params }: PageProps<"/projets/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const project = await getVisibleProject(id, user);
  if (!project) notFound();

  const [fields, history, kpis, diligences, risks, milestones] = await Promise.all([
    projectFields(project),
    db.auditLog.findMany({ where: { entity: "Projet", entityId: id }, orderBy: { createdAt: "desc" }, take: 8 }),
    db.kpi.findMany({ where: { projectId: id }, include: { values: { orderBy: { period: "desc" }, take: 1 } } }),
    db.diligence.findMany({ where: { projectId: id }, include: { status: true } }),
    db.risk.findMany({ where: { projectId: id } }),
    db.milestone.findMany({ where: { projectId: id }, orderBy: { dueDate: "asc" } }),
  ]);
  const now = new Date();
  const alerts = {
    kpiOff: kpis.filter((k) => kpiState(kpiAchievement(k, k.values[0]?.value ?? null), k).tone === "red").length,
    lateDiligences: diligences.filter((d) => isDiligenceLate(d, now)).length,
    criticalRisks: risks.filter((r) => isRiskOpen(r.status) && riskLevel(r.probability, r.impact).label === "Critique").length,
    lateMilestones: milestones.filter((m) => milestoneState(m, now).tone === "red").length,
  };
  const nextMilestones = milestones.filter((m) => m.status === "PREVU").slice(0, 3);
  const filledFields = fields.filter((f) => f.value !== null && f.value !== "");

  const info: [string, string][] = [
    ["Type", project.type?.label ?? "—"],
    ["Catégorie", project.category?.label ?? "—"],
    ["Sponsor", project.sponsor ? displayName(project.sponsor) : "—"],
    ["Responsable", project.owner ? displayName(project.owner) : "—"],
    ["Chef de projet", project.lead ? displayName(project.lead) : "—"],
    ["Parties prenantes externes", project.externalStakeholders ?? "—"],
    ["Date de début", formatDate(project.startDate)],
    ["Date de fin prévue", formatDate(project.endDatePlanned)],
    ["Date de fin réelle", formatDate(project.endDateActual)],
    ["Budget prévu", formatAmount(project.budgetPlanned)],
    ["Source de financement", project.fundingSource?.label ?? "—"],
    ["Axe stratégique", project.strategicAxis?.label ?? "—"],
    ["Objectif stratégique", project.strategicObjective ?? "—"],
    ["Lien PTBA", project.ptbaReference ?? "—"],
    ["Activité PTBA", project.ptbaActivity ?? "—"],
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <section className="card p-6">
          <h2 className="mb-3 font-semibold text-brand-800">Présentation</h2>
          <p className="text-sm whitespace-pre-line text-zinc-700">
            {project.description || "Aucune description renseignée."}
          </p>
          {project.goal && (
            <>
              <h3 className="mt-5 mb-1 text-sm font-semibold text-zinc-700">Objectif général</h3>
              <p className="text-sm whitespace-pre-line text-zinc-700">{project.goal}</p>
            </>
          )}
          {project.objectives && (
            <>
              <h3 className="mt-5 mb-1 text-sm font-semibold text-zinc-700">Objectifs spécifiques</h3>
              <ul className="list-inside list-disc text-sm text-zinc-700">
                {project.objectives
                  .split("\n")
                  .filter((line) => line.trim())
                  .map((line, i) => (
                    <li key={i}>{line.trim()}</li>
                  ))}
              </ul>
            </>
          )}
        </section>

        <section className="card p-6">
          <h2 className="mb-4 font-semibold text-brand-800">Informations clés</h2>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {info.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 border-b border-zinc-50 py-1">
                <dt className="text-zinc-500">{label}</dt>
                <dd className="text-right font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {filledFields.length > 0 && (
          <section className="card p-6">
            <h2 className="mb-4 font-semibold text-brand-800">Rubriques du projet</h2>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {filledFields.map(({ definition, value }) => (
                <div key={definition.id} className="flex justify-between gap-4 border-b border-zinc-50 py-1">
                  <dt className="text-zinc-500">{definition.label}</dt>
                  <dd className="text-right font-medium">{formatFieldValue(definition, value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>

      <div className="space-y-6">
        <section className="card p-6">
          <h2 className="mb-3 font-semibold text-brand-800">Points de vigilance</h2>
          <ul className="space-y-2 text-sm">
            {[
              ["Jalons dépassés", alerts.lateMilestones],
              ["Diligences en retard", alerts.lateDiligences],
              ["Risques critiques ouverts", alerts.criticalRisks],
              ["Indicateurs non atteints", alerts.kpiOff],
            ].map(([label, count]) => (
              <li key={label as string} className="flex items-center justify-between gap-3">
                <span>{label}</span>
                {Number(count) > 0 ? <Badge tone="red">{count}</Badge> : <span className="text-sm text-emerald-600">0</span>}
              </li>
            ))}
          </ul>
          {nextMilestones.length > 0 && (
            <>
              <h3 className="mt-5 mb-2 text-sm font-semibold text-zinc-700">Prochaines échéances</h3>
              <ul className="space-y-1 text-sm">
                {nextMilestones.map((m) => (
                  <li key={m.id} className="flex justify-between gap-3">
                    <span className="truncate">{m.name}</span>
                    <span className="text-zinc-500">{formatDate(m.dueDate)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="card p-6">
          <h2 className="mb-3 font-semibold text-brand-800">Équipe ({project.members.length})</h2>
          {project.members.length === 0 ? (
            <p className="text-sm text-zinc-500">Aucun intervenant affecté.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {project.members.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3">
                  <span>{displayName(m.user)}</span>
                  <span className="text-xs text-zinc-500">{PROJECT_ROLE_LABELS[m.role]}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-6">
          <h2 className="mb-3 font-semibold text-brand-800">Dernières modifications</h2>
          {history.length === 0 ? (
            <p className="text-sm text-zinc-500">Aucune modification enregistrée.</p>
          ) : (
            <ol className="space-y-3 text-sm">
              {history.map((h) => (
                <li key={h.id} className="border-l-2 border-brand-200 pl-3">
                  <p className="text-xs text-zinc-500">
                    {formatDateTime(h.createdAt)} · {h.userName ?? "Système"}
                  </p>
                  <p>
                    {h.field ? (
                      <>
                        <span className="font-medium">{h.field}</span> : {h.oldValue ?? "—"} → {h.newValue ?? "—"}
                      </>
                    ) : (
                      auditAction(h.action).label
                    )}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
