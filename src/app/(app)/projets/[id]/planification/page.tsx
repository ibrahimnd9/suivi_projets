import { notFound } from "next/navigation";
import { AlertTriangle, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser, displayName } from "@/lib/auth/session";
import { canEditProject } from "@/lib/auth/permissions";
import { getVisibleProject } from "@/lib/projects";
import {
  allowedChildKinds,
  buildTree,
  computeProgress,
  dependencyViolations,
  effectiveDates,
  flattenTree,
  isLate,
  workItemInclude,
  WORK_ITEM_LABELS,
  DEPENDENCY_LABELS,
} from "@/lib/planning";
import { Badge, EmptyState, ProgressBar, RefBadge, formatDate } from "@/components/ui";
import { Gantt, type GanttRow } from "@/components/gantt";
import { SubmitButton } from "@/components/submit-button";
import { ActionForm } from "@/components/action-form";
import { WorkItemForm } from "@/app/(app)/projets/work-item-form";
import {
  addDependency,
  deleteWorkItem,
  removeDependency,
  replanProject,
  saveWorkItem,
  setWorkItemProgress,
} from "@/app/(app)/projets/planning-actions";
import { DependencyKind } from "@/generated/prisma/enums";

const asInputDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function ProjectPlanningPage({ params }: PageProps<"/projets/[id]/planification">) {
  const user = await requireUser();
  const { id } = await params;
  const project = await getVisibleProject(id, user);
  if (!project) notFound();
  const editable = canEditProject(user, project);

  const [items, statuses, priorities, milestones] = await Promise.all([
    db.workItem.findMany({ where: { projectId: id }, include: workItemInclude, orderBy: { sortOrder: "asc" } }),
    db.refItem.findMany({ where: { kind: "TASK_STATUS", active: true }, orderBy: { sortOrder: "asc" } }),
    db.refItem.findMany({ where: { kind: "PRIORITY", active: true }, orderBy: { sortOrder: "asc" } }),
    db.milestone.findMany({ where: { projectId: id }, orderBy: { dueDate: "asc" } }),
  ]);

  const now = new Date();
  const tree = buildTree(items);
  const rows = flattenTree(tree);
  const violations = dependencyViolations(items);
  const people = project.members.map((m) => ({ id: m.userId, label: displayName(m.user) }));
  const parents = rows
    .filter((r) => allowedChildKinds(r.kind).length > 0)
    .map((r) => ({ id: r.id, label: `${"— ".repeat(r.depth)}${r.name} (${WORK_ITEM_LABELS[r.kind]})` }));
  const refOptions = (list: typeof statuses) => list.map((s) => ({ id: s.id, label: s.label }));

  const ganttRows: GanttRow[] = rows.map((node) => {
    const dates = effectiveDates(node);
    return {
      id: node.id,
      name: node.name,
      depth: node.depth,
      start: dates.start,
      end: dates.end,
      progress: computeProgress(node),
      late: isLate({ endDate: dates.end, status: node.status, progress: computeProgress(node) }, now),
      isContainer: node.children.length > 0,
    };
  });

  const lateCount = ganttRows.filter((r) => r.late).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Éléments", rows.length],
          ["Tâches", rows.filter((r) => r.kind === "TACHE").length],
          ["En retard", lateCount],
          ["Liens non respectés", violations.length],
        ].map(([label, value]) => (
          <div key={label as string} className="card p-4">
            <p className="text-sm text-zinc-500">{label}</p>
            <p className={`mt-1 text-2xl font-bold ${Number(value) > 0 && label !== "Éléments" && label !== "Tâches" ? "text-red-600" : "text-brand-700"}`}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {violations.length > 0 && (
        <div className="card border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div className="flex-1">
              <h2 className="font-semibold text-amber-800">Dépendances non respectées</h2>
              <ul className="mt-1 list-inside list-disc text-sm text-amber-800">
                {violations.map((v, i) => (
                  <li key={i}>{v.message}</li>
                ))}
              </ul>
              {editable && (
                <form action={replanProject.bind(null, project.id)} className="mt-3">
                  <SubmitButton className="btn btn-secondary" pendingLabel="Replanification…">
                    Replanifier automatiquement
                  </SubmitButton>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {editable && (
        <details className="card p-5">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-brand-800">
            <Plus className="size-4" /> Ajouter un élément au planning
          </summary>
          <div className="mt-4">
            <WorkItemForm
              action={saveWorkItem.bind(null, project.id, null)}
              kinds={["PHASE", "ACTIVITE", "SOUS_ACTIVITE", "TACHE"]}
              parents={parents}
              people={people}
              statuses={refOptions(statuses)}
              priorities={refOptions(priorities)}
              submitLabel="Ajouter"
              resetOnSuccess
            />
            <p className="mt-3 text-xs text-zinc-500">
              Hiérarchie : Projet → Phase → Activité → Sous-activité → Tâche. Les niveaux intermédiaires sont
              facultatifs. Seuls les membres de l’équipe projet peuvent être responsables.
            </p>
          </div>
        </details>
      )}

      <section className="card overflow-x-auto">
        {rows.length === 0 ? (
          <EmptyState>Le planning de ce projet est vide.</EmptyState>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Élément</th>
                <th>Responsable</th>
                <th>Statut</th>
                <th>Début</th>
                <th>Fin</th>
                <th className="min-w-36">Avancement</th>
                <th>Temps prévu</th>
                {editable && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((node) => {
                const dates = effectiveDates(node);
                const progress = computeProgress(node);
                const container = node.children.length > 0;
                const late = isLate({ endDate: dates.end, status: node.status, progress }, now);
                return (
                  <tr key={node.id} className={late ? "bg-red-50/40" : undefined}>
                    <td>
                      <div style={{ paddingLeft: `${node.depth * 16}px` }}>
                        <span className={container ? "font-semibold text-brand-800" : ""}>{node.name}</span>
                        <p className="text-xs text-zinc-400">
                          {WORK_ITEM_LABELS[node.kind]}
                          {node.assignees.length > 0 && ` · ${node.assignees.length} collaborateur(s)`}
                          {node.dependencies.length > 0 &&
                            ` · après ${node.dependencies.map((d) => d.dependsOn.name).join(", ")}`}
                        </p>
                      </div>
                    </td>
                    <td className="whitespace-nowrap">{node.owner ? displayName(node.owner) : "—"}</td>
                    <td><RefBadge item={node.status} /></td>
                    <td className="whitespace-nowrap">{formatDate(dates.start)}</td>
                    <td className={`whitespace-nowrap ${late ? "font-semibold text-red-600" : ""}`}>
                      {formatDate(dates.end)}
                      {late && <Badge tone="red">Retard</Badge>}
                    </td>
                    <td>
                      {container || !editable ? (
                        <ProgressBar value={progress} />
                      ) : (
                        <form action={setWorkItemProgress.bind(null, project.id, node.id)} className="flex items-center gap-2">
                          <input
                            name="progress"
                            type="number"
                            min="0"
                            max="100"
                            defaultValue={Math.round(Number(node.progress))}
                            className="input w-20 px-2 py-1"
                            aria-label={`Avancement de ${node.name}`}
                          />
                          <SubmitButton className="btn btn-secondary px-2 py-1 text-xs" pendingLabel="…">
                            OK
                          </SubmitButton>
                        </form>
                      )}
                    </td>
                    <td className="whitespace-nowrap">{node.plannedHours ? `${Number(node.plannedHours)} h` : "—"}</td>
                    {editable && (
                      <td className="relative text-right whitespace-nowrap">
                        <details className="inline-block">
                          <summary className="btn btn-secondary cursor-pointer list-none px-2 py-1 text-xs">Modifier</summary>
                          <div className="absolute right-0 z-10 mt-2 w-[min(46rem,85vw)] space-y-5 rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-lg">
                            <WorkItemForm
                              action={saveWorkItem.bind(null, project.id, node.id)}
                              kinds={["PHASE", "ACTIVITE", "SOUS_ACTIVITE", "TACHE"]}
                              parents={parents.filter((p) => p.id !== node.id)}
                              people={people}
                              statuses={refOptions(statuses)}
                              priorities={refOptions(priorities)}
                              submitLabel="Enregistrer"
                              values={{
                                kind: node.kind,
                                parentId: node.parentId,
                                name: node.name,
                                description: node.description,
                                ownerId: node.ownerId,
                                statusId: node.statusId,
                                priorityId: node.priorityId,
                                startDate: asInputDate(node.startDate),
                                endDate: asInputDate(node.endDate),
                                progress: String(node.progress),
                                plannedHours: node.plannedHours === null ? null : String(node.plannedHours),
                                sortOrder: node.sortOrder,
                                assignees: node.assignees.map((a) => a.userId),
                              }}
                            />

                            <div className="border-t border-zinc-100 pt-4">
                              <h3 className="mb-2 text-sm font-semibold text-brand-800">Dépendances</h3>
                              {node.dependencies.length > 0 && (
                                <ul className="mb-3 space-y-1 text-sm">
                                  {node.dependencies.map((link) => (
                                    <li key={link.id} className="flex items-center justify-between gap-3">
                                      <span>
                                        {DEPENDENCY_LABELS[link.kind]} · {link.dependsOn.name}
                                        {link.lagDays !== 0 && ` (${link.lagDays > 0 ? "+" : ""}${link.lagDays} j)`}
                                      </span>
                                      <form action={removeDependency.bind(null, project.id, link.id)}>
                                        <SubmitButton className="btn btn-danger px-2 py-0.5 text-xs" pendingLabel="…">
                                          Retirer
                                        </SubmitButton>
                                      </form>
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <ActionForm action={addDependency.bind(null, project.id, node.id)} submitLabel="Ajouter le lien">
                                <div className="grid gap-2 sm:grid-cols-3">
                                  <select name="dependsOnId" required className="input" aria-label="Élément précédent">
                                    <option value="">Élément précédent…</option>
                                    {rows
                                      .filter((r) => r.id !== node.id)
                                      .map((r) => (
                                        <option key={r.id} value={r.id}>{r.name}</option>
                                      ))}
                                  </select>
                                  <select name="kind" defaultValue={DependencyKind.FIN_DEBUT} className="input" aria-label="Type de lien">
                                    {Object.entries(DEPENDENCY_LABELS).map(([value, label]) => (
                                      <option key={value} value={value}>{label}</option>
                                    ))}
                                  </select>
                                  <input
                                    name="lagDays"
                                    type="number"
                                    defaultValue={0}
                                    className="input"
                                    aria-label="Décalage en jours"
                                    placeholder="Décalage (j)"
                                  />
                                </div>
                              </ActionForm>
                            </div>

                            <form action={deleteWorkItem.bind(null, project.id, node.id)} className="border-t border-zinc-100 pt-4">
                              <SubmitButton
                                className="btn btn-danger"
                                pendingLabel="Suppression…"
                                confirm={
                                  node.children.length
                                    ? `Supprimer « ${node.name} » et ses ${node.children.length} élément(s) rattaché(s) ?`
                                    : `Supprimer « ${node.name} » ?`
                                }
                              >
                                Supprimer cet élément
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

      <section className="card p-5">
        <h2 className="mb-4 font-semibold text-brand-800">Diagramme de Gantt</h2>
        <Gantt
          now={now}
          rows={ganttRows}
          markers={milestones.map((m) => ({
            id: m.id,
            name: m.name,
            date: m.dueDate,
            reached: m.status === "ATTEINT",
          }))}
        />
      </section>
    </div>
  );
}
