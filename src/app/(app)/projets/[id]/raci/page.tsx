import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, displayName } from "@/lib/auth/session";
import { canEditProject } from "@/lib/auth/permissions";
import { getVisibleProject } from "@/lib/projects";
import { buildTree, flattenTree, workItemInclude, WORK_ITEM_LABELS } from "@/lib/planning";
import { EmptyState } from "@/components/ui";
import { setRaci } from "@/app/(app)/projets/raci-actions";
import { RaciCell } from "./raci-cell";

const ROLE_HELP = [
  ["R", "Responsible — réalise le travail"],
  ["A", "Accountable — rend des comptes, une seule personne par ligne"],
  ["C", "Consulted — consulté avant décision"],
  ["I", "Informed — tenu informé"],
] as const;

export default async function ProjectRaciPage({ params }: PageProps<"/projets/[id]/raci">) {
  const user = await requireUser();
  const { id } = await params;
  const project = await getVisibleProject(id, user);
  if (!project) notFound();
  const editable = canEditProject(user, project);

  const items = await db.workItem.findMany({
    where: { projectId: id },
    include: { ...workItemInclude, raci: true },
    orderBy: { sortOrder: "asc" },
  });
  const rows = flattenTree(buildTree(items));
  const byId = new Map(items.map((i) => [i.id, i]));
  const members = project.members;

  // Lignes sans responsable désigné (A)
  const missingAccountable = rows.filter((row) => !byId.get(row.id)?.raci.some((r) => r.role === "A"));

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h2 className="mb-2 font-semibold text-brand-800">Matrice RACI</h2>
        <ul className="grid gap-1 text-sm text-zinc-600 sm:grid-cols-2">
          {ROLE_HELP.map(([letter, description]) => (
            <li key={letter}>
              <span className="mr-2 inline-flex size-5 items-center justify-center rounded bg-brand-100 text-xs font-bold text-brand-800">
                {letter}
              </span>
              {description}
            </li>
          ))}
        </ul>
        {missingAccountable.length > 0 && (
          <p className="mt-3 text-sm text-amber-700">
            {missingAccountable.length} élément(s) sans « A » désigné : {missingAccountable.slice(0, 3).map((r) => r.name).join(", ")}
            {missingAccountable.length > 3 && "…"}
          </p>
        )}
      </section>

      <section className="card overflow-x-auto">
        {rows.length === 0 || members.length === 0 ? (
          <EmptyState>
            {rows.length === 0
              ? "Ajoutez d’abord des éléments dans l’onglet Planification."
              : "Affectez d’abord des intervenants dans l’onglet Équipe."}
          </EmptyState>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th className="min-w-64">Élément</th>
                {members.map((member) => (
                  <th key={member.id} className="text-center">{displayName(member.user)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const assignments = byId.get(row.id)?.raci ?? [];
                return (
                  <tr key={row.id}>
                    <td>
                      <div style={{ paddingLeft: `${row.depth * 16}px` }}>
                        <span className={row.children.length > 0 ? "font-semibold text-brand-800" : ""}>{row.name}</span>
                        <p className="text-xs text-zinc-400">{WORK_ITEM_LABELS[row.kind]}</p>
                      </div>
                    </td>
                    {members.map((member) => {
                      const current = assignments.find((a) => a.userId === member.userId)?.role ?? "";
                      return (
                        <td key={member.id} className="text-center">
                          {editable ? (
                            <RaciCell
                              action={setRaci.bind(null, project.id, row.id, member.userId)}
                              value={current}
                              label={`${row.name} — ${displayName(member.user)}`}
                            />
                          ) : (
                            <span className="font-semibold text-brand-700">{current || "—"}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <p className="text-xs text-zinc-500">
        Une personne ne peut avoir qu’un seul rôle par ligne, et un seul « A » est conservé par élément : désigner un
        nouveau responsable remplace le précédent.
      </p>
    </div>
  );
}
