import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, displayName } from "@/lib/auth/session";
import { canEditProject } from "@/lib/auth/permissions";
import { getVisibleProject } from "@/lib/projects";
import { milestoneState } from "@/lib/planning";
import { MILESTONE_STATUS_LABELS } from "@/lib/planning-labels";
import { Badge, EmptyState, RefBadge, formatDate } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { deleteMilestone, saveMilestone } from "@/app/(app)/projets/planning-actions";
import { MilestoneStatus } from "@/generated/prisma/enums";

const asInputDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

function MilestoneFields({
  values,
  people,
  criticalities,
  workItems,
}: {
  values?: {
    name: string;
    description: string | null;
    dueDate: Date;
    actualDate: Date | null;
    status: MilestoneStatus;
    ownerId: string | null;
    criticalityId: string | null;
    workItemId: string | null;
  };
  people: { id: string; label: string }[];
  criticalities: { id: string; label: string }[];
  workItems: { id: string; label: string }[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label">Nom du jalon *</label>
        <input name="name" defaultValue={values?.name} required className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Description</label>
        <input name="description" defaultValue={values?.description ?? ""} className="input" />
      </div>
      <div>
        <label className="label">Date prévue *</label>
        <input name="dueDate" type="date" defaultValue={values ? asInputDate(values.dueDate) : ""} required className="input" />
      </div>
      <div>
        <label className="label">Date réelle</label>
        <input name="actualDate" type="date" defaultValue={asInputDate(values?.actualDate ?? null)} className="input" />
      </div>
      <div>
        <label className="label">Statut</label>
        <select name="status" defaultValue={values?.status ?? MilestoneStatus.PREVU} className="input">
          {Object.entries(MILESTONE_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Criticité</label>
        <select name="criticalityId" defaultValue={values?.criticalityId ?? ""} className="input">
          <option value="">—</option>
          {criticalities.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
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
        <label className="label">Élément de planning associé</label>
        <select name="workItemId" defaultValue={values?.workItemId ?? ""} className="input">
          <option value="">—</option>
          {workItems.map((w) => (
            <option key={w.id} value={w.id}>{w.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default async function ProjectMilestonesPage({ params }: PageProps<"/projets/[id]/jalons">) {
  const user = await requireUser();
  const { id } = await params;
  const project = await getVisibleProject(id, user);
  if (!project) notFound();
  const editable = canEditProject(user, project);

  const [milestones, criticalities, workItems] = await Promise.all([
    db.milestone.findMany({
      where: { projectId: id },
      include: { owner: true, criticality: true, workItem: true },
      orderBy: { dueDate: "asc" },
    }),
    db.refItem.findMany({ where: { kind: "PRIORITY", active: true }, orderBy: { sortOrder: "asc" } }),
    db.workItem.findMany({ where: { projectId: id }, orderBy: { sortOrder: "asc" } }),
  ]);

  const now = new Date();
  const people = project.members.map((m) => ({ id: m.userId, label: displayName(m.user) }));
  const criticalityOptions = criticalities.map((c) => ({ id: c.id, label: c.label }));
  const workItemOptions = workItems.map((w) => ({ id: w.id, label: w.name }));
  const overdue = milestones.filter((m) => milestoneState(m, now).tone === "red").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Jalons", milestones.length],
          ["Atteints", milestones.filter((m) => m.status === "ATTEINT").length],
          ["Dépassés", overdue],
        ].map(([label, value]) => (
          <div key={label as string} className="card p-4">
            <p className="text-sm text-zinc-500">{label}</p>
            <p className={`mt-1 text-2xl font-bold ${label === "Dépassés" && Number(value) > 0 ? "text-red-600" : "text-brand-700"}`}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {editable && (
        <section className="card p-5">
          <h2 className="mb-4 font-semibold text-brand-800">Ajouter un jalon</h2>
          <ActionForm action={saveMilestone.bind(null, project.id, null)} submitLabel="Ajouter" resetOnSuccess>
            <MilestoneFields people={people} criticalities={criticalityOptions} workItems={workItemOptions} />
          </ActionForm>
        </section>
      )}

      <section className="card overflow-x-auto">
        {milestones.length === 0 ? (
          <EmptyState>Aucun jalon défini pour ce projet.</EmptyState>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Jalon</th>
                <th>Date prévue</th>
                <th>Date réelle</th>
                <th>État</th>
                <th>Criticité</th>
                <th>Responsable</th>
                {editable && <th />}
              </tr>
            </thead>
            <tbody>
              {milestones.map((milestone) => {
                const state = milestoneState(milestone, now);
                return (
                  <tr key={milestone.id}>
                    <td>
                      <span className="font-medium">{milestone.name}</span>
                      {milestone.description && <p className="text-xs text-zinc-500">{milestone.description}</p>}
                      {milestone.workItem && (
                        <p className="text-xs text-zinc-400">Lié à : {milestone.workItem.name}</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap">{formatDate(milestone.dueDate)}</td>
                    <td className="whitespace-nowrap">{formatDate(milestone.actualDate)}</td>
                    <td><Badge tone={state.tone}>{state.label}</Badge></td>
                    <td><RefBadge item={milestone.criticality} /></td>
                    <td className="whitespace-nowrap">{milestone.owner ? displayName(milestone.owner) : "—"}</td>
                    {editable && (
                      <td className="relative text-right">
                        <details className="inline-block">
                          <summary className="btn btn-secondary cursor-pointer list-none px-2 py-1 text-xs">Modifier</summary>
                          <div className="absolute right-0 z-10 mt-2 w-[min(40rem,85vw)] space-y-4 rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-lg">
                            <ActionForm action={saveMilestone.bind(null, project.id, milestone.id)}>
                              <MilestoneFields
                                values={milestone}
                                people={people}
                                criticalities={criticalityOptions}
                                workItems={workItemOptions}
                              />
                            </ActionForm>
                            <form action={deleteMilestone.bind(null, project.id, milestone.id)} className="border-t border-zinc-100 pt-4">
                              <SubmitButton
                                className="btn btn-danger"
                                pendingLabel="Suppression…"
                                confirm={`Supprimer le jalon « ${milestone.name} » ?`}
                              >
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
