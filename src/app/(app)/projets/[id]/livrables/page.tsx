import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser, displayName } from "@/lib/auth/session";
import { canEditProject } from "@/lib/auth/permissions";
import { getVisibleProject } from "@/lib/projects";
import { Badge, EmptyState, formatDate } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { deleteDeliverable, saveDeliverable } from "@/app/(app)/projets/documents-actions";
import { DeliverableStatus } from "@/generated/prisma/enums";

const asInputDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

const STATUS_LABELS: Record<DeliverableStatus, string> = {
  PREVU: "Prévu",
  EN_COURS: "En cours",
  LIVRE: "Livré",
  VALIDE: "Validé",
  ANNULE: "Annulé",
};

const STATUS_TONES: Record<DeliverableStatus, "zinc" | "brand" | "amber" | "green" | "red"> = {
  PREVU: "zinc",
  EN_COURS: "brand",
  LIVRE: "amber",
  VALIDE: "green",
  ANNULE: "red",
};

function DeliverableFields({
  values,
  people,
  workItems,
  documents,
}: {
  values?: {
    name: string;
    description: string | null;
    ownerId: string | null;
    dueDate: Date | null;
    actualDate: Date | null;
    status: DeliverableStatus;
    version: string | null;
    workItemId: string | null;
    documentId: string | null;
  };
  people: { id: string; label: string }[];
  workItems: { id: string; label: string }[];
  documents: { id: string; label: string }[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label">Livrable *</label>
        <input name="name" defaultValue={values?.name} required className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Description</label>
        <input name="description" defaultValue={values?.description ?? ""} className="input" />
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
        <select name="status" defaultValue={values?.status ?? DeliverableStatus.PREVU} className="input">
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Date prévue</label>
        <input name="dueDate" type="date" defaultValue={asInputDate(values?.dueDate ?? null)} className="input" />
      </div>
      <div>
        <label className="label">Date réelle</label>
        <input name="actualDate" type="date" defaultValue={asInputDate(values?.actualDate ?? null)} className="input" />
      </div>
      <div>
        <label className="label">Version</label>
        <input name="version" defaultValue={values?.version ?? ""} placeholder="v1.0" className="input" />
      </div>
      <div>
        <label className="label">Produit par (planning)</label>
        <select name="workItemId" defaultValue={values?.workItemId ?? ""} className="input">
          <option value="">—</option>
          {workItems.map((w) => (
            <option key={w.id} value={w.id}>{w.label}</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label">Document associé</label>
        <select name="documentId" defaultValue={values?.documentId ?? ""} className="input">
          <option value="">—</option>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>{d.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default async function ProjectDeliverablesPage({ params }: PageProps<"/projets/[id]/livrables">) {
  const user = await requireUser();
  const { id } = await params;
  const project = await getVisibleProject(id, user);
  if (!project) notFound();
  const editable = canEditProject(user, project);

  const [deliverables, workItems, documents] = await Promise.all([
    db.deliverable.findMany({
      where: { projectId: id },
      include: { owner: true, workItem: true, document: true },
      orderBy: [{ dueDate: "asc" }],
    }),
    db.workItem.findMany({ where: { projectId: id }, orderBy: { sortOrder: "asc" } }),
    db.document.findMany({ where: { projectId: id, next: null }, orderBy: { createdAt: "desc" } }),
  ]);

  const now = new Date();
  const people = project.members.map((m) => ({ id: m.userId, label: displayName(m.user) }));
  const workItemOptions = workItems.map((w) => ({ id: w.id, label: w.name }));
  const documentOptions = documents.map((d) => ({ id: d.id, label: `${d.title} (v${d.version})` }));
  const isLate = (d: (typeof deliverables)[number]) =>
    !!d.dueDate && d.dueDate < now && d.status !== "VALIDE" && d.status !== "LIVRE" && d.status !== "ANNULE";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Livrables", deliverables.length, "text-brand-700"],
          ["Livrés", deliverables.filter((d) => d.status === "LIVRE" || d.status === "VALIDE").length, "text-emerald-600"],
          ["En retard", deliverables.filter(isLate).length, deliverables.filter(isLate).length ? "text-red-600" : "text-brand-700"],
          ["Avec document", deliverables.filter((d) => d.documentId).length, "text-brand-700"],
        ].map(([label, value, tone]) => (
          <div key={label as string} className="card p-4">
            <p className="text-sm text-zinc-500">{label}</p>
            <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
          </div>
        ))}
      </div>

      {editable && (
        <details className="card p-5">
          <summary className="cursor-pointer list-none font-semibold text-brand-800">+ Ajouter un livrable</summary>
          <div className="mt-4">
            <ActionForm action={saveDeliverable.bind(null, project.id, null)} submitLabel="Ajouter" resetOnSuccess>
              <DeliverableFields people={people} workItems={workItemOptions} documents={documentOptions} />
            </ActionForm>
          </div>
        </details>
      )}

      <section className="card overflow-x-auto">
        {deliverables.length === 0 ? (
          <EmptyState>Aucun livrable défini pour ce projet.</EmptyState>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Livrable</th>
                <th>Responsable</th>
                <th>Date prévue</th>
                <th>Date réelle</th>
                <th>Version</th>
                <th>Statut</th>
                <th>Document</th>
                {editable && <th />}
              </tr>
            </thead>
            <tbody>
              {deliverables.map((deliverable) => (
                <tr key={deliverable.id} className={isLate(deliverable) ? "bg-red-50/40" : undefined}>
                  <td>
                    <span className="font-medium">{deliverable.name}</span>
                    {deliverable.description && <p className="text-xs text-zinc-500">{deliverable.description}</p>}
                    {deliverable.workItem && <p className="text-xs text-zinc-400">Produit par : {deliverable.workItem.name}</p>}
                  </td>
                  <td className="whitespace-nowrap">{deliverable.owner ? displayName(deliverable.owner) : "—"}</td>
                  <td className={`whitespace-nowrap ${isLate(deliverable) ? "font-semibold text-red-600" : ""}`}>
                    {formatDate(deliverable.dueDate)}
                  </td>
                  <td className="whitespace-nowrap">{formatDate(deliverable.actualDate)}</td>
                  <td>{deliverable.version ?? "—"}</td>
                  <td><Badge tone={STATUS_TONES[deliverable.status]}>{STATUS_LABELS[deliverable.status]}</Badge></td>
                  <td>
                    {deliverable.document ? (
                      <a href={`/api/documents/${deliverable.document.id}`} className="text-brand-600 hover:underline">
                        <Download className="mr-1 inline size-3.5" />
                        {deliverable.document.title}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  {editable && (
                    <td className="relative text-right">
                      <details className="inline-block">
                        <summary className="btn btn-secondary cursor-pointer list-none px-2 py-1 text-xs">Modifier</summary>
                        <div className="absolute right-0 z-10 mt-2 w-[min(40rem,85vw)] space-y-4 rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-lg">
                          <ActionForm action={saveDeliverable.bind(null, project.id, deliverable.id)}>
                            <DeliverableFields
                              values={deliverable}
                              people={people}
                              workItems={workItemOptions}
                              documents={documentOptions}
                            />
                          </ActionForm>
                          <form action={deleteDeliverable.bind(null, project.id, deliverable.id)} className="border-t border-zinc-100 pt-3">
                            <SubmitButton className="btn btn-danger" pendingLabel="…" confirm={`Supprimer « ${deliverable.name} » ?`}>
                              Supprimer
                            </SubmitButton>
                          </form>
                        </div>
                      </details>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="text-xs text-zinc-500">
        Passer un livrable au statut « Livré » ou « Validé » renseigne automatiquement la date réelle. Les documents
        proposés viennent de l’onglet Documents du projet.
      </p>
    </div>
  );
}
