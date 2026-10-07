import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/ui";
import { nextProjectCode } from "@/lib/projects";
import { createProject } from "@/app/(app)/projets/actions";
import { loadProjectFormOptions } from "@/app/(app)/projets/form-options";
import { ProjectForm } from "@/app/(app)/projets/project-form";

export const metadata: Metadata = { title: "Nouveau projet" };

export default async function NewProjectPage() {
  const user = await requireUser();
  if (!can(user.profile, "projects.create")) redirect("/?refus=1");

  const [options, code] = await Promise.all([loadProjectFormOptions(), nextProjectCode()]);

  return (
    <>
      <PageHeader
        title="Nouveau projet"
        description={`Le code ${code} sera attribué automatiquement.`}
        actions={<Link href="/portefeuille" className="btn btn-secondary">Retour au portefeuille</Link>}
      />
      <div className="card max-w-4xl p-6">
        <ProjectForm action={createProject} options={options} submitLabel="Créer le projet" />
      </div>
    </>
  );
}
