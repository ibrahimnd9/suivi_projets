import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { can, PROFILE_LABELS } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";

const HOME_BLOCKS = {
  UTILISATEUR: ["Mes projets", "Mes tâches", "Ma fiche de temps", "Mes échéances", "Mes notifications"],
  MANAGER: ["Mes projets", "Avancement", "Risques", "Diligences", "KPI", "Validations de temps"],
  DIRECTION: ["Portefeuille", "Projets à risque", "Projets en retard", "Budget", "Indicateurs", "Alertes"],
  ADMIN: ["Portefeuille", "Utilisateurs", "Référentiels", "Journal d’activité"],
} as const;

function loadAdminStats() {
  const since = new Date(Date.now() - 86_400_000);
  return Promise.all([
    db.user.count({ where: { active: true } }),
    db.direction.count({ where: { active: true } }),
    db.pole.count({ where: { active: true } }),
    db.auditLog.count({ where: { createdAt: { gte: since } } }),
  ]);
}

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const { refus } = await searchParams;

  const stats = can(user.profile, "admin.users") ? await loadAdminStats() : null;

  return (
    <>
      <PageHeader
        title={`Bonjour ${user.firstName}`}
        description={`${PROFILE_LABELS[user.profile]}${user.direction ? ` · ${user.direction.name}` : ""}${user.pole ? ` · ${user.pole.name}` : ""}`}
      />

      {refus && (
        <div className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Vous n’avez pas accès à cette page avec votre profil.
        </div>
      )}

      {stats && (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Utilisateurs actifs", stats[0], "/admin/utilisateurs"],
            ["Directions", stats[1], "/admin/organisation"],
            ["Pôles", stats[2], "/admin/organisation"],
            ["Actions tracées (24 h)", stats[3], "/admin/journal"],
          ].map(([label, value, href]) => (
            <Link key={label as string} href={href as string} className="card p-5 transition hover:border-brand-200">
              <p className="text-sm text-zinc-500">{label}</p>
              <p className="mt-1 text-3xl font-bold text-brand-700">{value}</p>
            </Link>
          ))}
        </div>
      )}

      <div className="card p-6">
        <h2 className="font-semibold text-brand-800">Votre espace</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Les blocs suivants seront alimentés au fil des prochaines étapes du développement.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {HOME_BLOCKS[user.profile].map((label) => (
            <div key={label} className="rounded-lg border border-dashed border-brand-200 bg-brand-50 px-4 py-6 text-sm font-medium text-brand-700">
              {label}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
