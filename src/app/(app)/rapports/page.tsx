import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { visibleProjectsWhere } from "@/lib/projects";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Rapports et exports" };

const EXPORTS = [
  ["projets", "Portefeuille des projets", "Code, statut, acteurs, dates, avancement et budget prévu."],
  ["planning", "Planning détaillé", "Phases, activités et tâches avec dates, avancement et charge prévue."],
  ["temps", "Fiches de temps", "Saisies détaillées avec projet, type d’activité et statut de validation."],
  ["kpi", "Indicateurs", "Référence, cible, dernière valeur et taux de réalisation."],
  ["diligences", "Diligences", "Actions, responsables, échéances et statuts."],
  ["risques", "Risques et problèmes", "Probabilité, impact, criticité et plan de mitigation."],
  ["budget", "Budget", "Lignes budgétaires avec initial, révisé, engagé et réalisé."],
] as const;

export default async function ReportsPage() {
  const user = await requireUser();
  const projects = await db.project.findMany({
    where: visibleProjectsWhere(user),
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });

  return (
    <>
      <PageHeader
        title="Rapports et exports"
        description="Documents prêts à imprimer et extractions Excel, limités aux projets que vous pouvez consulter."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-1 font-semibold text-brand-800">Rapports</h2>
          <p className="mb-4 text-sm text-zinc-500">
            Le rapport s’ouvre en page imprimable : utilisez « Imprimer » puis « Enregistrer au format PDF ».
          </p>
          <ul className="space-y-2">
            <li>
              <Link href="/rapports/portefeuille" className="btn btn-secondary w-full justify-start">
                <FileText className="size-4" /> Rapport de portefeuille
              </Link>
            </li>
            {projects.map((project) => (
              <li key={project.id}>
                <Link href={`/rapports/projet/${project.id}`} className="btn btn-secondary w-full justify-start">
                  <FileText className="size-4" /> Rapport du projet {project.code} — {project.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="mb-1 font-semibold text-brand-800">Exports Excel</h2>
          <p className="mb-4 text-sm text-zinc-500">
            Fichiers CSV à séparateur point-virgule, ouverts directement par Excel.
          </p>
          <ul className="space-y-2">
            {EXPORTS.map(([key, label, description]) => (
              <li key={key} className="flex items-center justify-between gap-3 border-b border-zinc-100 pb-2">
                <span>
                  <span className="font-medium">{label}</span>
                  <p className="text-xs text-zinc-500">{description}</p>
                </span>
                <a href={`/api/export/${key}`} className="btn btn-secondary shrink-0 px-2 py-1 text-xs">
                  <Download className="size-3.5" /> Exporter
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
