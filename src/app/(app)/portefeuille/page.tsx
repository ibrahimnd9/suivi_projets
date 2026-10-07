import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { visibleProjectsWhere } from "@/lib/projects";
import { EmptyState, PageHeader, ProgressBar, RefBadge, formatAmount, formatDate } from "@/components/ui";
import type { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Portefeuille des projets" };

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function PortfolioPage({ searchParams }: PageProps<"/portefeuille">) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = str(sp.q).trim();
  const statusId = str(sp.statut);
  const directionId = str(sp.direction);
  const priorityId = str(sp.priorite);
  const typeId = str(sp.type);
  const leadId = str(sp.chef);
  const strategic = str(sp.strategique) === "1";
  const late = str(sp.retard) === "1";
  const view = str(sp.vue) === "kanban" ? "kanban" : "tableau";

  const where: Prisma.ProjectWhereInput = {
    AND: [
      visibleProjectsWhere(user),
      ...(q
        ? [
            {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { code: { contains: q, mode: "insensitive" as const } },
                { description: { contains: q, mode: "insensitive" as const } },
              ],
            },
          ]
        : []),
      ...(statusId ? [{ statusId }] : []),
      ...(directionId ? [{ directionId }] : []),
      ...(priorityId ? [{ priorityId }] : []),
      ...(typeId ? [{ typeId }] : []),
      ...(leadId ? [{ leadId }] : []),
      ...(strategic ? [{ strategic: true }] : []),
      // En retard : fin prévue dépassée sans date de fin réelle
      ...(late ? [{ endDatePlanned: { lt: new Date() }, endDateActual: null }] : []),
    ],
  };

  const [projects, statuses, directions, priorities, types, leads] = await Promise.all([
    db.project.findMany({
      where,
      include: { status: true, priority: true, type: true, direction: true, lead: true, _count: { select: { members: true } } },
      orderBy: [{ updatedAt: "desc" }],
    }),
    db.refItem.findMany({ where: { kind: "PROJECT_STATUS" }, orderBy: { sortOrder: "asc" } }),
    db.direction.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.refItem.findMany({ where: { kind: "PRIORITY", active: true }, orderBy: { sortOrder: "asc" } }),
    db.refItem.findMany({ where: { kind: "PROJECT_TYPE", active: true }, orderBy: { sortOrder: "asc" } }),
    db.user.findMany({
      where: { active: true, projectsLed: { some: {} } },
      orderBy: [{ lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  const now = new Date();
  const isLate = (p: (typeof projects)[number]) => !!p.endDatePlanned && p.endDatePlanned < now && !p.endDateActual;
  const totalBudget = projects.reduce((sum, p) => sum + Number(p.budgetPlanned ?? 0), 0);
  const averageProgress = projects.length
    ? projects.reduce((sum, p) => sum + Number(p.progress), 0) / projects.length
    : 0;

  const linkWithView = (v: string) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      if (typeof value === "string" && key !== "vue") params.set(key, value);
    }
    params.set("vue", v);
    return `/portefeuille?${params}`;
  };

  return (
    <>
      <PageHeader
        title="Portefeuille des projets"
        description={`${projects.length} projet${projects.length > 1 ? "s" : ""} visible${projects.length > 1 ? "s" : ""}`}
        actions={
          can(user.profile, "projects.create") ? (
            <Link href="/portefeuille/nouveau" className="btn btn-primary">
              <Plus className="size-4" /> Nouveau projet
            </Link>
          ) : undefined
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Projets", projects.length],
          ["En retard", projects.filter(isLate).length],
          ["Avancement moyen", `${Math.round(averageProgress)} %`],
          ["Budget prévu", formatAmount(totalBudget)],
        ].map(([label, value]) => (
          <div key={label as string} className="card p-4">
            <p className="text-sm text-zinc-500">{label}</p>
            <p className="mt-1 text-2xl font-bold text-brand-700">{value}</p>
          </div>
        ))}
      </div>

      <form className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <input name="q" defaultValue={q} placeholder="Rechercher (nom, code, description)…" className="input lg:col-span-2" />
        <select name="statut" defaultValue={statusId} className="input" aria-label="Statut">
          <option value="">Tous les statuts</option>
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <select name="direction" defaultValue={directionId} className="input" aria-label="Direction">
          <option value="">Toutes les directions</option>
          {directions.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select name="type" defaultValue={typeId} className="input" aria-label="Type">
          <option value="">Tous les types</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <select name="priorite" defaultValue={priorityId} className="input" aria-label="Priorité">
          <option value="">Toutes les priorités</option>
          {priorities.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <select name="chef" defaultValue={leadId} className="input" aria-label="Chef de projet">
          <option value="">Tous les chefs de projet</option>
          {leads.map((l) => (
            <option key={l.id} value={l.id}>{l.lastName.toUpperCase()} {l.firstName}</option>
          ))}
        </select>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" name="strategique" value="1" defaultChecked={strategic} className="accent-brand-600" />
            Stratégiques
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" name="retard" value="1" defaultChecked={late} className="accent-brand-600" />
            En retard
          </label>
        </div>
        <input type="hidden" name="vue" value={view} />
        <button className="btn btn-secondary">Filtrer</button>
      </form>

      <div className="mb-3 flex gap-2 text-sm">
        {[
          ["tableau", "Vue tableau"],
          ["kanban", "Vue Kanban"],
        ].map(([value, label]) => (
          <Link
            key={value}
            href={linkWithView(value)}
            className={`rounded-lg px-3 py-1.5 ${
              view === value ? "bg-brand-100 font-semibold text-brand-800" : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            {label}
          </Link>
        ))}
        <span className="ml-auto self-center text-xs text-zinc-400">Vues calendrier et Gantt à l’étape suivante</span>
      </div>

      {projects.length === 0 ? (
        <div className="card"><EmptyState>Aucun projet ne correspond à ces critères.</EmptyState></div>
      ) : view === "kanban" ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {statuses
            .filter((s) => projects.some((p) => p.statusId === s.id))
            .map((status) => (
              <section key={status.id} className="w-72 shrink-0">
                <header className="mb-2 flex items-center justify-between">
                  <RefBadge item={status} />
                  <span className="text-xs text-zinc-500">{projects.filter((p) => p.statusId === status.id).length}</span>
                </header>
                <div className="space-y-2">
                  {projects
                    .filter((p) => p.statusId === status.id)
                    .map((p) => (
                      <Link key={p.id} href={`/projets/${p.id}`} className="card block p-3 transition hover:border-brand-300">
                        <p className="font-mono text-[11px] text-zinc-400">{p.code}</p>
                        <p className="font-semibold text-brand-800">{p.name}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {p.lead ? `${p.lead.firstName} ${p.lead.lastName}` : "Chef de projet non désigné"}
                        </p>
                        <ProgressBar value={Number(p.progress)} className="mt-3" />
                        {isLate(p) && <p className="mt-2 text-xs font-semibold text-red-600">En retard</p>}
                      </Link>
                    ))}
                </div>
              </section>
            ))}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Projet</th>
                <th>Direction</th>
                <th>Chef de projet</th>
                <th>Statut</th>
                <th>Priorité</th>
                <th>Échéance</th>
                <th className="min-w-36">Avancement</th>
                <th>Budget prévu</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/projets/${p.id}`} className="font-semibold text-brand-700 hover:underline">
                      {p.name}
                    </Link>
                    <p className="font-mono text-xs text-zinc-400">
                      {p.code}
                      {p.strategic && <span className="ml-2 font-sans font-semibold text-brand-600">Stratégique</span>}
                    </p>
                  </td>
                  <td>{p.direction?.name ?? "—"}</td>
                  <td className="whitespace-nowrap">{p.lead ? `${p.lead.firstName} ${p.lead.lastName}` : "—"}</td>
                  <td><RefBadge item={p.status} /></td>
                  <td><RefBadge item={p.priority} /></td>
                  <td className={`whitespace-nowrap ${isLate(p) ? "font-semibold text-red-600" : ""}`}>
                    {formatDate(p.endDatePlanned)}
                  </td>
                  <td><ProgressBar value={Number(p.progress)} /></td>
                  <td className="whitespace-nowrap">{formatAmount(p.budgetPlanned)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
