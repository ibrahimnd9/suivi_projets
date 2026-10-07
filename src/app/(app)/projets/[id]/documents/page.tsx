import { notFound } from "next/navigation";
import { Download, Upload } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser, displayName } from "@/lib/auth/session";
import { canEditProject } from "@/lib/auth/permissions";
import { getVisibleProject } from "@/lib/projects";
import { ALLOWED_EXTENSIONS, MAX_FILE_SIZE, formatFileSize } from "@/lib/storage";
import { Badge, EmptyState, RefBadge, formatDateTime } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { deleteDocument, updateDocument, uploadDocument } from "@/app/(app)/projets/documents-actions";

export default async function ProjectDocumentsPage({ searchParams, params }: PageProps<"/projets/[id]/documents">) {
  const user = await requireUser();
  const { id } = await params;
  const { categorie } = await searchParams;
  const project = await getVisibleProject(id, user);
  if (!project) notFound();
  const editable = canEditProject(user, project);

  const [documents, categories] = await Promise.all([
    db.document.findMany({
      where: { projectId: id, ...(typeof categorie === "string" && categorie ? { categoryId: categorie } : {}) },
      include: { category: true, uploadedBy: true, previous: true, next: true, deliverable: true },
      orderBy: { createdAt: "desc" },
    }),
    db.refItem.findMany({ where: { kind: "DOCUMENT_CATEGORY", active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  // Une seule ligne par document, la version la plus récente en tête
  const current = documents.filter((d) => !d.next);
  const totalSize = documents.reduce((sum, d) => sum + d.size, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Documents", current.length],
          ["Versions conservées", documents.length],
          ["Espace occupé", formatFileSize(totalSize)],
        ].map(([label, value]) => (
          <div key={label as string} className="card p-4">
            <p className="text-sm text-zinc-500">{label}</p>
            <p className="mt-1 text-2xl font-bold text-brand-700">{value}</p>
          </div>
        ))}
      </div>

      {editable && (
        <section className="card p-5">
          <h2 className="mb-1 font-semibold text-brand-800">Déposer un document</h2>
          <p className="mb-4 text-sm text-zinc-500">
            Formats acceptés : {ALLOWED_EXTENSIONS}. Taille maximale : {Math.round(MAX_FILE_SIZE / 1024 / 1024)} Mo.
          </p>
          <ActionForm action={uploadDocument.bind(null, project.id)} submitLabel="Déposer" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Titre *</label>
                <input name="title" required className="input" />
              </div>
              <div>
                <label className="label">Catégorie</label>
                <select name="categoryId" className="input">
                  <option value="">—</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label">Description</label>
                <input name="description" className="input" />
              </div>
              <div>
                <label className="label">Fichier *</label>
                <input name="file" type="file" required className="input py-1.5" />
              </div>
              <div>
                <label className="label">Nouvelle version de</label>
                <select name="replacesId" className="input">
                  <option value="">Nouveau document</option>
                  {current.map((d) => (
                    <option key={d.id} value={d.id}>{d.title} (v{d.version})</option>
                  ))}
                </select>
              </div>
            </div>
          </ActionForm>
        </section>
      )}

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          <a
            href={`/projets/${project.id}/documents`}
            className={`rounded-lg px-3 py-1.5 ${!categorie ? "bg-brand-100 font-semibold text-brand-800" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            Toutes les catégories
          </a>
          {categories.map((category) => (
            <a
              key={category.id}
              href={`/projets/${project.id}/documents?categorie=${category.id}`}
              className={`rounded-lg px-3 py-1.5 ${
                categorie === category.id ? "bg-brand-100 font-semibold text-brand-800" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {category.label}
            </a>
          ))}
        </div>
      )}

      <section className="card overflow-x-auto">
        {current.length === 0 ? (
          <EmptyState>Aucun document déposé pour ce projet.</EmptyState>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Catégorie</th>
                <th>Version</th>
                <th>Taille</th>
                <th>Déposé par</th>
                <th>Date</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {current.map((document) => (
                <tr key={document.id}>
                  <td>
                    <span className="font-medium">{document.title}</span>
                    <p className="text-xs text-zinc-500">{document.fileName}</p>
                    {document.description && <p className="text-xs text-zinc-500">{document.description}</p>}
                    {document.deliverable && <Badge tone="brand">Livrable</Badge>}
                  </td>
                  <td><RefBadge item={document.category} /></td>
                  <td>
                    v{document.version}
                    {document.previous && <p className="text-xs text-zinc-400">remplace v{document.previous.version}</p>}
                  </td>
                  <td className="whitespace-nowrap">{formatFileSize(document.size)}</td>
                  <td className="whitespace-nowrap">{document.uploadedBy ? displayName(document.uploadedBy) : "—"}</td>
                  <td className="whitespace-nowrap">{formatDateTime(document.createdAt)}</td>
                  <td className="relative text-right whitespace-nowrap">
                    <a href={`/api/documents/${document.id}`} className="btn btn-secondary px-2 py-1 text-xs">
                      <Download className="size-3.5" /> Télécharger
                    </a>
                    {editable && (
                      <details className="ml-2 inline-block">
                        <summary className="btn btn-secondary cursor-pointer list-none px-2 py-1 text-xs">Modifier</summary>
                        <div className="absolute right-0 z-10 mt-2 w-[min(32rem,85vw)] space-y-4 rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-lg">
                          <ActionForm action={updateDocument.bind(null, project.id, document.id)}>
                            <div className="space-y-3">
                              <div>
                                <label className="label">Titre</label>
                                <input name="title" defaultValue={document.title} required className="input" />
                              </div>
                              <div>
                                <label className="label">Description</label>
                                <input name="description" defaultValue={document.description ?? ""} className="input" />
                              </div>
                              <div>
                                <label className="label">Catégorie</label>
                                <select name="categoryId" defaultValue={document.categoryId ?? ""} className="input">
                                  <option value="">—</option>
                                  {categories.map((c) => (
                                    <option key={c.id} value={c.id}>{c.label}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </ActionForm>
                          <form action={deleteDocument.bind(null, project.id, document.id)} className="border-t border-zinc-100 pt-3">
                            <SubmitButton
                              className="btn btn-danger"
                              pendingLabel="…"
                              confirm={`Supprimer « ${document.title} » (v${document.version}) ? Le fichier sera effacé.`}
                            >
                              Supprimer
                            </SubmitButton>
                          </form>
                        </div>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {documents.length > current.length && (
        <section className="card p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-brand-800">
            <Upload className="size-4" /> Versions antérieures
          </h2>
          <ul className="divide-y divide-zinc-100 text-sm">
            {documents
              .filter((d) => d.next)
              .map((document) => (
                <li key={document.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    {document.title} <span className="text-zinc-400">v{document.version}</span>
                    <span className="ml-2 text-xs text-zinc-500">{formatDateTime(document.createdAt)}</span>
                  </span>
                  <a href={`/api/documents/${document.id}`} className="btn btn-secondary px-2 py-1 text-xs">
                    <Download className="size-3.5" /> Télécharger
                  </a>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
