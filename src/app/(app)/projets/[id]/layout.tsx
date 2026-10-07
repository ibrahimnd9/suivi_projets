import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { canEditProject } from "@/lib/auth/permissions";
import { getVisibleProject, PROJECT_TABS, PROJECT_TABS_SOON } from "@/lib/projects";
import { Badge, ProgressBar, RefBadge, formatDate } from "@/components/ui";
import { ProjectTabs } from "./tabs";

export async function generateMetadata({ params }: LayoutProps<"/projets/[id]">) {
  const { id } = await params;
  const project = await db.project.findUnique({ where: { id }, select: { code: true, name: true } });
  return { title: project ? `${project.name} (${project.code})` : "Projet" };
}

export default async function ProjectLayout({ children, params }: LayoutProps<"/projets/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const project = await getVisibleProject(id, user);
  if (!project) notFound();

  const late = !!project.endDatePlanned && project.endDatePlanned < new Date() && !project.endDateActual;

  return (
    <>
      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-zinc-400">{project.code}</p>
            <h1 className="text-2xl font-bold text-brand-800">{project.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <RefBadge item={project.status} />
              {project.priority && <RefBadge item={project.priority} />}
              {project.strategic && <Badge tone="brand">Stratégique</Badge>}
              {late && <Badge tone="red">En retard</Badge>}
              <span className="text-sm text-zinc-500">
                {project.direction?.name ?? "Direction non renseignée"}
                {project.pole ? ` · ${project.pole.name}` : ""}
              </span>
            </div>
          </div>
          <div className="min-w-56 space-y-2">
            <ProgressBar value={Number(project.progress)} />
            <p className="text-sm text-zinc-500">
              {formatDate(project.startDate)} → {formatDate(project.endDatePlanned)}
            </p>
            {!canEditProject(user, project) && <p className="text-xs text-zinc-400">Consultation seule</p>}
          </div>
        </div>

        <nav className="mt-5 flex flex-wrap items-center gap-1 border-b border-zinc-200">
          <ProjectTabs projectId={project.id} tabs={[...PROJECT_TABS]} />
          {PROJECT_TABS_SOON.map((label) => (
            <span key={label} className="px-3 py-2 text-sm text-zinc-300" title="Disponible dans une prochaine étape">
              {label}
            </span>
          ))}
        </nav>
      </header>
      <Link href="/portefeuille" className="mb-4 inline-block text-sm text-brand-600 hover:underline">
        ← Retour au portefeuille
      </Link>
      {children}
    </>
  );
}
