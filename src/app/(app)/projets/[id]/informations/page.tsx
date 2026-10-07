import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { canEditProject } from "@/lib/auth/permissions";
import { getVisibleProject } from "@/lib/projects";
import { updateProject } from "@/app/(app)/projets/actions";
import { loadProjectFormOptions } from "@/app/(app)/projets/form-options";
import { ProjectForm } from "@/app/(app)/projets/project-form";

const asInputDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function ProjectInformationPage({ params }: PageProps<"/projets/[id]/informations"> ) {
  const user = await requireUser();
  const { id } = await params;
  const project = await getVisibleProject(id, user);
  if (!project) notFound();

  if (!canEditProject(user, project)) {
    return (
      <div className="card p-6 text-sm text-zinc-600">
        Vous pouvez consulter ce projet, mais sa modification est réservée au chef de projet, au responsable et à
        l’administrateur.
      </div>
    );
  }

  const options = await loadProjectFormOptions();

  return (
    <div className="card max-w-4xl p-6">
      <ProjectForm
        action={updateProject.bind(null, project.id)}
        options={options}
        submitLabel="Enregistrer"
        values={{
          name: project.name,
          description: project.description,
          goal: project.goal,
          objectives: project.objectives,
          typeId: project.typeId,
          categoryId: project.categoryId,
          priorityId: project.priorityId,
          statusId: project.statusId,
          directionId: project.directionId,
          poleId: project.poleId,
          sponsorId: project.sponsorId,
          ownerId: project.ownerId,
          leadId: project.leadId,
          externalStakeholders: project.externalStakeholders,
          startDate: asInputDate(project.startDate),
          endDatePlanned: asInputDate(project.endDatePlanned),
          endDateActual: asInputDate(project.endDateActual),
          progress: String(project.progress),
          strategic: project.strategic,
          strategicAxisId: project.strategicAxisId,
          strategicObjective: project.strategicObjective,
          ptbaReference: project.ptbaReference,
          ptbaActivity: project.ptbaActivity,
          budgetPlanned: project.budgetPlanned === null ? null : String(project.budgetPlanned),
          fundingSourceId: project.fundingSourceId,
        }}
      />
    </div>
  );
}
