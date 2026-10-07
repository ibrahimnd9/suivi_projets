import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, displayName } from "@/lib/auth/session";
import { canEditProject, PROJECT_ROLE_LABELS } from "@/lib/auth/permissions";
import { getVisibleProject } from "@/lib/projects";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { EmptyState } from "@/components/ui";
import { removeMember, saveMember } from "@/app/(app)/projets/actions";
import { ProjectRole } from "@/generated/prisma/enums";

export default async function ProjectTeamPage({ params }: PageProps<"/projets/[id]/equipe">) {
  const user = await requireUser();
  const { id } = await params;
  const project = await getVisibleProject(id, user);
  if (!project) notFound();
  const editable = canEditProject(user, project);

  const people = editable
    ? await db.user.findMany({
        where: { active: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: { id: true, firstName: true, lastName: true, jobTitle: true },
      })
    : [];

  const totalPlanned = project.members.reduce((sum, m) => sum + Number(m.plannedHours ?? 0), 0);

  return (
    <div className="space-y-6">
      {editable && (
        <section className="card p-5">
          <h2 className="mb-3 font-semibold text-brand-800">Affecter un intervenant</h2>
          <ActionForm action={saveMember.bind(null, project.id)} submitLabel="Affecter" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label">Personne</label>
                <select name="userId" required className="input">
                  <option value="">Choisir…</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.lastName.toUpperCase()} {p.firstName}
                      {p.jobTitle ? ` — ${p.jobTitle}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Rôle sur le projet</label>
                <select name="role" defaultValue={ProjectRole.MEMBRE} className="input">
                  {Object.entries(PROJECT_ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Charge prévue (heures)</label>
                <input name="plannedHours" type="number" min="0" step="0.5" className="input" />
              </div>
            </div>
          </ActionForm>
          <p className="mt-3 text-xs text-zinc-500">
            Affecter une personne déjà présente met à jour son rôle et sa charge prévue.
          </p>
        </section>
      )}

      <section className="card overflow-x-auto">
        {project.members.length === 0 ? (
          <EmptyState>Aucun intervenant n’est affecté à ce projet.</EmptyState>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Intervenant</th>
                <th>Direction</th>
                <th>Rôle sur le projet</th>
                <th>Charge prévue</th>
                {editable && <th />}
              </tr>
            </thead>
            <tbody>
              {project.members.map((m) => {
                const locked = m.userId === project.leadId || m.userId === project.ownerId;
                return (
                  <tr key={m.id}>
                    <td>
                      <span className="font-medium">{displayName(m.user)}</span>
                      {m.user.jobTitle && <p className="text-xs text-zinc-500">{m.user.jobTitle}</p>}
                    </td>
                    <td>{m.user.direction?.name ?? "—"}</td>
                    <td>{PROJECT_ROLE_LABELS[m.role]}</td>
                    <td>{m.plannedHours ? `${Number(m.plannedHours)} h` : "—"}</td>
                    {editable && (
                      <td className="text-right">
                        {locked ? (
                          <span className="text-xs text-zinc-400">Rôle défini dans la fiche projet</span>
                        ) : (
                          <form action={removeMember.bind(null, project.id, m.id)}>
                            <SubmitButton
                              className="btn btn-danger px-2 py-1 text-xs"
                              pendingLabel="…"
                              confirm={`Retirer ${displayName(m.user)} de l’équipe ?`}
                            >
                              Retirer
                            </SubmitButton>
                          </form>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {totalPlanned > 0 && (
        <p className="text-sm text-zinc-500">
          Charge prévue totale : <span className="font-semibold text-zinc-700">{totalPlanned} h</span>. Elle sera
          comparée au temps réellement consommé à l’étape « Fiches de temps ».
        </p>
      )}
    </div>
  );
}
