import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { canEditProject } from "@/lib/auth/permissions";
import { getVisibleProject } from "@/lib/projects";
import { budgetTotals } from "@/lib/monitoring";
import { Badge, EmptyState, ProgressBar, RefBadge, formatAmount, formatDate } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { deleteBudgetLine, saveBudgetLine } from "@/app/(app)/projets/monitoring-actions";

const asInputDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

function BudgetFields({
  values,
  natures,
  workItems,
}: {
  values?: {
    label: string;
    natureId: string | null;
    workItemId: string | null;
    period: Date | null;
    initial: { toString(): string };
    revised: { toString(): string } | null;
    committed: { toString(): string };
    spent: { toString(): string };
    comment: string | null;
    sortOrder: number;
  };
  natures: { id: string; label: string }[];
  workItems: { id: string; label: string }[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label">Libellé de la ligne *</label>
        <input name="label" defaultValue={values?.label} required className="input" />
      </div>
      <div>
        <label className="label">Nature de dépense</label>
        <select name="natureId" defaultValue={values?.natureId ?? ""} className="input">
          <option value="">—</option>
          {natures.map((n) => (
            <option key={n.id} value={n.id}>{n.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Rattachement (phase ou activité)</label>
        <select name="workItemId" defaultValue={values?.workItemId ?? ""} className="input">
          <option value="">—</option>
          {workItems.map((w) => (
            <option key={w.id} value={w.id}>{w.label}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:col-span-2 lg:grid-cols-4">
        <div>
          <label className="label">Budget initial *</label>
          <input name="initial" inputMode="decimal" defaultValue={values?.initial?.toString() ?? "0"} className="input" />
        </div>
        <div>
          <label className="label">Budget révisé</label>
          <input name="revised" inputMode="decimal" defaultValue={values?.revised?.toString() ?? ""} className="input" />
        </div>
        <div>
          <label className="label">Engagements</label>
          <input name="committed" inputMode="decimal" defaultValue={values?.committed?.toString() ?? "0"} className="input" />
        </div>
        <div>
          <label className="label">Dépenses réalisées</label>
          <input name="spent" inputMode="decimal" defaultValue={values?.spent?.toString() ?? "0"} className="input" />
        </div>
      </div>
      <div>
        <label className="label">Période</label>
        <input name="period" type="date" defaultValue={asInputDate(values?.period ?? null)} className="input" />
      </div>
      <div>
        <label className="label">Ordre</label>
        <input name="sortOrder" type="number" min="0" defaultValue={values?.sortOrder ?? 0} className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Commentaire</label>
        <input name="comment" defaultValue={values?.comment ?? ""} className="input" />
      </div>
    </div>
  );
}

export default async function ProjectBudgetPage({ params }: PageProps<"/projets/[id]/budget">) {
  const user = await requireUser();
  const { id } = await params;
  const project = await getVisibleProject(id, user);
  if (!project) notFound();
  const editable = canEditProject(user, project);

  const [lines, natures, workItems] = await Promise.all([
    db.budgetLine.findMany({
      where: { projectId: id },
      include: { nature: true, workItem: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    db.refItem.findMany({ where: { kind: "BUDGET_NATURE", active: true }, orderBy: { sortOrder: "asc" } }),
    db.workItem.findMany({ where: { projectId: id }, orderBy: { sortOrder: "asc" } }),
  ]);

  const totals = budgetTotals(lines);
  const planned = project.budgetPlanned === null ? null : Number(project.budgetPlanned);
  const natureOptions = natures.map((n) => ({ id: n.id, label: n.label }));
  const workItemOptions = workItems.map((w) => ({ id: w.id, label: w.name }));

  // Ventilation par nature de dépense
  const byNature = natures
    .map((nature) => {
      const natureLines = lines.filter((l) => l.natureId === nature.id);
      return { label: nature.label, spent: natureLines.reduce((sum, l) => sum + Number(l.spent), 0) };
    })
    .concat(
      lines.some((l) => !l.natureId)
        ? [{ label: "Sans nature", spent: lines.filter((l) => !l.natureId).reduce((sum, l) => sum + Number(l.spent), 0) }]
        : [],
    )
    .filter((row) => row.spent > 0)
    .sort((a, b) => b.spent - a.spent);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Budget initial", formatAmount(totals.initial)],
          ["Budget révisé", formatAmount(totals.revised)],
          ["Engagements", formatAmount(totals.committed)],
          ["Dépenses réalisées", formatAmount(totals.spent)],
          ["Reste disponible", formatAmount(totals.available)],
        ].map(([label, value]) => (
          <div key={label} className="card p-4">
            <p className="text-sm text-zinc-500">{label}</p>
            <p className="mt-1 text-lg font-bold text-brand-700">{value}</p>
          </div>
        ))}
      </div>

      <section className="card p-5">
        <h2 className="mb-3 font-semibold text-brand-800">Taux de consommation budgétaire</h2>
        <ProgressBar value={totals.consumptionRate} />
        <p className="mt-3 text-sm text-zinc-500">
          Dépenses réalisées ÷ budget révisé × 100. Écart budgétaire :{" "}
          <span className={totals.variance < 0 ? "font-semibold text-red-600" : "font-medium text-zinc-700"}>
            {formatAmount(totals.variance)}
          </span>
          .
        </p>
        {planned !== null && Math.abs(planned - totals.revised) > 0.5 && lines.length > 0 && (
          <p className="mt-2 text-sm text-amber-700">
            Le budget prévu dans la fiche projet ({formatAmount(planned)}) diffère du total des lignes
            ({formatAmount(totals.revised)}).
          </p>
        )}
        {totals.consumptionRate > 90 && (
          <p className="mt-2">
            <Badge tone="red">Seuil d’alerte dépassé : plus de 90 % du budget consommé</Badge>
          </p>
        )}
      </section>

      {editable && (
        <details className="card p-5">
          <summary className="cursor-pointer list-none font-semibold text-brand-800">+ Ajouter une ligne budgétaire</summary>
          <div className="mt-4">
            <ActionForm action={saveBudgetLine.bind(null, project.id, null)} submitLabel="Ajouter" resetOnSuccess>
              <BudgetFields natures={natureOptions} workItems={workItemOptions} />
            </ActionForm>
          </div>
        </details>
      )}

      <section className="card overflow-x-auto">
        {lines.length === 0 ? (
          <EmptyState>Aucune ligne budgétaire. Le budget prévu de la fiche projet sert de référence.</EmptyState>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Ligne</th>
                <th>Nature</th>
                <th>Rattachement</th>
                <th>Initial</th>
                <th>Révisé</th>
                <th>Engagé</th>
                <th>Réalisé</th>
                <th>Reste</th>
                {editable && <th />}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const reference = Number(line.revised ?? line.initial);
                const rest = reference - Number(line.committed) - Number(line.spent);
                return (
                  <tr key={line.id}>
                    <td>
                      <span className="font-medium">{line.label}</span>
                      {line.period && <p className="text-xs text-zinc-400">{formatDate(line.period)}</p>}
                      {line.comment && <p className="text-xs text-zinc-500">{line.comment}</p>}
                    </td>
                    <td><RefBadge item={line.nature} /></td>
                    <td>{line.workItem?.name ?? "—"}</td>
                    <td className="whitespace-nowrap">{formatAmount(line.initial)}</td>
                    <td className="whitespace-nowrap">{line.revised === null ? "—" : formatAmount(line.revised)}</td>
                    <td className="whitespace-nowrap">{formatAmount(line.committed)}</td>
                    <td className="whitespace-nowrap">{formatAmount(line.spent)}</td>
                    <td className={`whitespace-nowrap ${rest < 0 ? "font-semibold text-red-600" : ""}`}>{formatAmount(rest)}</td>
                    {editable && (
                      <td className="relative text-right">
                        <details className="inline-block">
                          <summary className="btn btn-secondary cursor-pointer list-none px-2 py-1 text-xs">Modifier</summary>
                          <div className="absolute right-0 z-10 mt-2 w-[min(46rem,85vw)] space-y-4 rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-lg">
                            <ActionForm action={saveBudgetLine.bind(null, project.id, line.id)}>
                              <BudgetFields values={line} natures={natureOptions} workItems={workItemOptions} />
                            </ActionForm>
                            <form action={deleteBudgetLine.bind(null, project.id, line.id)} className="border-t border-zinc-100 pt-3">
                              <SubmitButton className="btn btn-danger" pendingLabel="…" confirm={`Supprimer la ligne « ${line.label} » ?`}>
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
            <tfoot>
              <tr>
                <td colSpan={3} className="text-right font-semibold">Total</td>
                <td className="font-bold">{formatAmount(totals.initial)}</td>
                <td className="font-bold">{formatAmount(totals.revised)}</td>
                <td className="font-bold">{formatAmount(totals.committed)}</td>
                <td className="font-bold">{formatAmount(totals.spent)}</td>
                <td className="font-bold">{formatAmount(totals.available)}</td>
                {editable && <td />}
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      {byNature.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-3 font-semibold text-brand-800">Dépenses par nature</h2>
          <ul className="space-y-2 text-sm">
            {byNature.map((row) => (
              <li key={row.label}>
                <div className="flex justify-between gap-3">
                  <span>{row.label}</span>
                  <span className="font-medium">{formatAmount(row.spent)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                  <div className="h-full bg-brand-500" style={{ width: `${totals.spent ? (row.spent / totals.spent) * 100 : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
