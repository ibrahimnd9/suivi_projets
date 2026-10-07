import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, displayName } from "@/lib/auth/session";
import { canEditProject } from "@/lib/auth/permissions";
import { getVisibleProject } from "@/lib/projects";
import { isDiligenceLate } from "@/lib/monitoring";
import { Badge, EmptyState, RefBadge, formatDate } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { deleteDiligence, saveDiligence } from "@/app/(app)/projets/monitoring-actions";

const asInputDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

function DiligenceFields({
  values,
  statuses,
  priorities,
  people,
  meetings,
}: {
  values?: {
    title: string;
    origin: string | null;
    description: string | null;
    ownerId: string | null;
    issuedAt: Date | null;
    dueDate: Date | null;
    statusId: string;
    priorityId: string | null;
    comment: string | null;
    proofUrl: string | null;
    meetingId: string | null;
  };
  statuses: { id: string; label: string; isDefault: boolean }[];
  priorities: { id: string; label: string }[];
  people: { id: string; label: string }[];
  meetings: { id: string; label: string }[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label">Action *</label>
        <input name="title" defaultValue={values?.title} required className="input" />
      </div>
      <div>
        <label className="label">Origine</label>
        <input name="origin" defaultValue={values?.origin ?? ""} placeholder="COPIL du 12/09, audit…" className="input" />
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
        <label className="label">Date d’émission</label>
        <input name="issuedAt" type="date" defaultValue={asInputDate(values?.issuedAt ?? null)} className="input" />
      </div>
      <div>
        <label className="label">Date d’échéance</label>
        <input name="dueDate" type="date" defaultValue={asInputDate(values?.dueDate ?? null)} className="input" />
      </div>
      <div>
        <label className="label">Statut *</label>
        <select
          name="statusId"
          defaultValue={values?.statusId ?? statuses.find((s) => s.isDefault)?.id ?? statuses[0]?.id}
          className="input"
        >
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Priorité</label>
        <select name="priorityId" defaultValue={values?.priorityId ?? ""} className="input">
          <option value="">—</option>
          {priorities.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label">Description</label>
        <input name="description" defaultValue={values?.description ?? ""} className="input" />
      </div>
      <div>
        <label className="label">Commentaire</label>
        <input name="comment" defaultValue={values?.comment ?? ""} className="input" />
      </div>
      <div>
        <label className="label">Réunion d’origine</label>
        <select name="meetingId" defaultValue={values?.meetingId ?? ""} className="input">
          <option value="">—</option>
          {meetings.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Preuve (lien)</label>
        <input name="proofUrl" defaultValue={values?.proofUrl ?? ""} placeholder="https://…" className="input" />
      </div>
    </div>
  );
}

export default async function ProjectDiligencesPage({ params }: PageProps<"/projets/[id]/diligences">) {
  const user = await requireUser();
  const { id } = await params;
  const project = await getVisibleProject(id, user);
  if (!project) notFound();
  const editable = canEditProject(user, project);

  const [diligences, statuses, priorities, meetings] = await Promise.all([
    db.diligence.findMany({
      where: { projectId: id },
      include: { owner: true, status: true, priority: true, meeting: true },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    }),
    db.refItem.findMany({ where: { kind: "DILIGENCE_STATUS", active: true }, orderBy: { sortOrder: "asc" } }),
    db.refItem.findMany({ where: { kind: "PRIORITY", active: true }, orderBy: { sortOrder: "asc" } }),
    db.meeting.findMany({ where: { projectId: id }, orderBy: { date: "desc" } }),
  ]);

  const now = new Date();
  const people = project.members.map((m) => ({ id: m.userId, label: displayName(m.user) }));
  const meetingOptions = meetings.map((m) => ({ id: m.id, label: `${formatDate(m.date)} — ${m.subject}` }));
  const statusOptions = statuses.map((s) => ({ id: s.id, label: s.label, isDefault: s.isDefault }));
  const priorityOptions = priorities.map((p) => ({ id: p.id, label: p.label }));

  const isDone = (d: (typeof diligences)[number]) => (d.status.meta as { done?: boolean } | null)?.done === true;
  const late = diligences.filter((d) => isDiligenceLate(d, now));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Diligences", diligences.length, "text-brand-700"],
          ["Ouvertes", diligences.filter((d) => !isDone(d)).length, "text-brand-700"],
          ["En retard", late.length, late.length ? "text-red-600" : "text-brand-700"],
          ["Réalisées", diligences.filter(isDone).length, "text-emerald-600"],
        ].map(([label, value, tone]) => (
          <div key={label as string} className="card p-4">
            <p className="text-sm text-zinc-500">{label}</p>
            <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
          </div>
        ))}
      </div>

      {editable && (
        <details className="card p-5">
          <summary className="cursor-pointer list-none font-semibold text-brand-800">+ Ajouter une diligence</summary>
          <div className="mt-4">
            <ActionForm action={saveDiligence.bind(null, project.id, null)} submitLabel="Ajouter" resetOnSuccess>
              <DiligenceFields statuses={statusOptions} priorities={priorityOptions} people={people} meetings={meetingOptions} />
            </ActionForm>
          </div>
        </details>
      )}

      <section className="card overflow-x-auto">
        {diligences.length === 0 ? (
          <EmptyState>Aucune diligence enregistrée pour ce projet.</EmptyState>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Origine</th>
                <th>Responsable</th>
                <th>Échéance</th>
                <th>Statut</th>
                <th>Priorité</th>
                {editable && <th />}
              </tr>
            </thead>
            <tbody>
              {diligences.map((diligence) => {
                const overdue = isDiligenceLate(diligence, now);
                return (
                  <tr key={diligence.id} className={overdue ? "bg-red-50/40" : undefined}>
                    <td>
                      <span className="font-medium">{diligence.title}</span>
                      {diligence.description && <p className="text-xs text-zinc-500">{diligence.description}</p>}
                      {diligence.proofUrl && (
                        <a href={diligence.proofUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-600 hover:underline">
                          Preuve
                        </a>
                      )}
                    </td>
                    <td>{diligence.origin ?? "—"}</td>
                    <td className="whitespace-nowrap">{diligence.owner ? displayName(diligence.owner) : "—"}</td>
                    <td className={`whitespace-nowrap ${overdue ? "font-semibold text-red-600" : ""}`}>
                      {formatDate(diligence.dueDate)}
                      {overdue && <Badge tone="red">En retard</Badge>}
                      {diligence.closedAt && (
                        <p className="text-xs text-zinc-400">clôturée le {formatDate(diligence.closedAt)}</p>
                      )}
                    </td>
                    <td><RefBadge item={diligence.status} /></td>
                    <td><RefBadge item={diligence.priority} /></td>
                    {editable && (
                      <td className="relative text-right">
                        <details className="inline-block">
                          <summary className="btn btn-secondary cursor-pointer list-none px-2 py-1 text-xs">Modifier</summary>
                          <div className="absolute right-0 z-10 mt-2 w-[min(46rem,85vw)] space-y-4 rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-lg">
                            <ActionForm action={saveDiligence.bind(null, project.id, diligence.id)}>
                              <DiligenceFields
                                values={diligence}
                                statuses={statusOptions}
                                priorities={priorityOptions}
                                people={people}
                                meetings={meetingOptions}
                              />
                            </ActionForm>
                            <form action={deleteDiligence.bind(null, project.id, diligence.id)} className="border-t border-zinc-100 pt-3">
                              <SubmitButton className="btn btn-danger" pendingLabel="…" confirm={`Supprimer « ${diligence.title} » ?`}>
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

      <p className="text-xs text-zinc-500">
        Le statut « en retard » est calculé : échéance dépassée et action ni réalisée ni annulée. Les statuts
        eux-mêmes se paramètrent dans Administration → Référentiels.
      </p>
    </div>
  );
}
