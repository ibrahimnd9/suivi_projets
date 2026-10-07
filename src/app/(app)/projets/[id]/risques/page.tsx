import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, displayName } from "@/lib/auth/session";
import { canEditProject } from "@/lib/auth/permissions";
import { getVisibleProject } from "@/lib/projects";
import { RISK_KIND_LABELS, RISK_STATUS_LABELS, isRiskOpen, riskLevel } from "@/lib/monitoring";
import { Badge, EmptyState, RefBadge, formatDate } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { deleteRisk, saveRisk } from "@/app/(app)/projets/monitoring-actions";
import { RiskKind, RiskStatus } from "@/generated/prisma/enums";

const asInputDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const SCALE = [1, 2, 3, 4, 5];

function RiskFields({
  values,
  categories,
  people,
}: {
  values?: {
    kind: RiskKind;
    title: string;
    categoryId: string | null;
    description: string | null;
    probability: number;
    impact: number;
    ownerId: string | null;
    identifiedAt: Date | null;
    mitigationPlan: string | null;
    dueDate: Date | null;
    status: RiskStatus;
  };
  categories: { id: string; label: string }[];
  people: { id: string; label: string }[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label">Nature *</label>
        <select name="kind" defaultValue={values?.kind ?? RiskKind.RISQUE} className="input">
          {Object.entries(RISK_KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Catégorie</label>
        <select name="categoryId" defaultValue={values?.categoryId ?? ""} className="input">
          <option value="">—</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label">Intitulé *</label>
        <input name="title" defaultValue={values?.title} required className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Description</label>
        <input name="description" defaultValue={values?.description ?? ""} className="input" />
      </div>
      <div>
        <label className="label">Probabilité (1 à 5) *</label>
        <select name="probability" defaultValue={String(values?.probability ?? 3)} className="input">
          {SCALE.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Impact (1 à 5) *</label>
        <select name="impact" defaultValue={String(values?.impact ?? 3)} className="input">
          {SCALE.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Responsable</label>
        <select name="ownerId" defaultValue={values?.ownerId ?? ""} className="input">
          <option value="">—</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Statut *</label>
        <select name="status" defaultValue={values?.status ?? RiskStatus.IDENTIFIE} className="input">
          {Object.entries(RISK_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Date d’identification</label>
        <input name="identifiedAt" type="date" defaultValue={asInputDate(values?.identifiedAt ?? null)} className="input" />
      </div>
      <div>
        <label className="label">Échéance du plan</label>
        <input name="dueDate" type="date" defaultValue={asInputDate(values?.dueDate ?? null)} className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Plan de mitigation</label>
        <textarea name="mitigationPlan" rows={2} defaultValue={values?.mitigationPlan ?? ""} className="input" />
      </div>
    </div>
  );
}

export default async function ProjectRisksPage({ params }: PageProps<"/projets/[id]/risques">) {
  const user = await requireUser();
  const { id } = await params;
  const project = await getVisibleProject(id, user);
  if (!project) notFound();
  const editable = canEditProject(user, project);

  const [risks, categories] = await Promise.all([
    db.risk.findMany({
      where: { projectId: id },
      include: { owner: true, category: true },
      orderBy: [{ probability: "desc" }, { impact: "desc" }],
    }),
    db.refItem.findMany({ where: { kind: "RISK_CATEGORY", active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  const people = project.members.map((m) => ({ id: m.userId, label: displayName(m.user) }));
  const categoryOptions = categories.map((c) => ({ id: c.id, label: c.label }));
  const open = risks.filter((r) => isRiskOpen(r.status));
  const critical = open.filter((r) => riskLevel(r.probability, r.impact).label === "Critique");

  // Matrice 5 × 5 : impact en lignes (du plus fort au plus faible), probabilité en colonnes
  const matrix = [5, 4, 3, 2, 1].map((impact) => ({
    impact,
    cells: SCALE.map((probability) => ({
      probability,
      level: riskLevel(probability, impact),
      items: open.filter((r) => r.probability === probability && r.impact === impact),
    })),
  }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Risques et problèmes", risks.length, "text-brand-700"],
          ["Ouverts", open.length, "text-brand-700"],
          ["Critiques", critical.length, critical.length ? "text-red-600" : "text-brand-700"],
          ["Problèmes avérés", risks.filter((r) => r.status === "AVERE").length, "text-amber-600"],
        ].map(([label, value, tone]) => (
          <div key={label as string} className="card p-4">
            <p className="text-sm text-zinc-500">{label}</p>
            <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
          </div>
        ))}
      </div>

      {editable && (
        <details className="card p-5">
          <summary className="cursor-pointer list-none font-semibold text-brand-800">+ Enregistrer un risque ou un problème</summary>
          <div className="mt-4">
            <ActionForm action={saveRisk.bind(null, project.id, null)} submitLabel="Enregistrer" resetOnSuccess>
              <RiskFields categories={categoryOptions} people={people} />
            </ActionForm>
          </div>
        </details>
      )}

      <section className="card p-5">
        <h2 className="mb-1 font-semibold text-brand-800">Matrice de criticité</h2>
        <p className="mb-4 text-sm text-zinc-500">
          Criticité = probabilité × impact. Faible jusqu’à 6, moyenne de 8 à 12, critique à partir de 15.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-[32rem] text-center text-xs">
            <tbody>
              {matrix.map((row) => (
                <tr key={row.impact}>
                  <th className="w-24 p-2 text-right font-medium text-zinc-500">Impact {row.impact}</th>
                  {row.cells.map((cell) => (
                    <td
                      key={cell.probability}
                      className="h-16 w-20 border border-white p-1 align-top"
                      style={{ background: `${cell.level.color}22` }}
                      title={`Criticité ${cell.level.score} — ${cell.level.label}`}
                    >
                      <span className="block text-[10px] text-zinc-500">{cell.level.score}</span>
                      {cell.items.map((item) => (
                        <span key={item.id} className="mt-0.5 block truncate font-medium text-zinc-800" title={item.title}>
                          {item.title}
                        </span>
                      ))}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <th />
                {SCALE.map((p) => (
                  <th key={p} className="p-2 font-medium text-zinc-500">Probabilité {p}</th>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="card overflow-x-auto">
        {risks.length === 0 ? (
          <EmptyState>Aucun risque ni problème enregistré.</EmptyState>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Intitulé</th>
                <th>Nature</th>
                <th>Catégorie</th>
                <th>P × I</th>
                <th>Criticité</th>
                <th>Responsable</th>
                <th>Échéance</th>
                <th>Statut</th>
                {editable && <th />}
              </tr>
            </thead>
            <tbody>
              {risks.map((risk) => {
                const level = riskLevel(risk.probability, risk.impact);
                return (
                  <tr key={risk.id}>
                    <td>
                      <span className="font-medium">{risk.title}</span>
                      {risk.description && <p className="text-xs text-zinc-500">{risk.description}</p>}
                      {risk.mitigationPlan && (
                        <p className="text-xs text-zinc-500">Mitigation : {risk.mitigationPlan}</p>
                      )}
                    </td>
                    <td>{RISK_KIND_LABELS[risk.kind]}</td>
                    <td><RefBadge item={risk.category} /></td>
                    <td className="whitespace-nowrap">{risk.probability} × {risk.impact}</td>
                    <td><Badge tone={level.tone}>{level.label} ({level.score})</Badge></td>
                    <td className="whitespace-nowrap">{risk.owner ? displayName(risk.owner) : "—"}</td>
                    <td className="whitespace-nowrap">{formatDate(risk.dueDate)}</td>
                    <td>{RISK_STATUS_LABELS[risk.status]}</td>
                    {editable && (
                      <td className="relative text-right">
                        <details className="inline-block">
                          <summary className="btn btn-secondary cursor-pointer list-none px-2 py-1 text-xs">Modifier</summary>
                          <div className="absolute right-0 z-10 mt-2 w-[min(46rem,85vw)] space-y-4 rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-lg">
                            <ActionForm action={saveRisk.bind(null, project.id, risk.id)}>
                              <RiskFields values={risk} categories={categoryOptions} people={people} />
                            </ActionForm>
                            <form action={deleteRisk.bind(null, project.id, risk.id)} className="border-t border-zinc-100 pt-3">
                              <SubmitButton className="btn btn-danger" pendingLabel="…" confirm={`Supprimer « ${risk.title} » ?`}>
                                Supprimer
                              </SubmitButton>
                            </form>
                          </div>
                        </details>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
