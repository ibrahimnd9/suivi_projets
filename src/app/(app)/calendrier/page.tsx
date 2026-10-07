import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { visibleProjectsWhere } from "@/lib/projects";
import { PageHeader, formatDate } from "@/components/ui";

export const metadata: Metadata = { title: "Calendrier" };

type Kind = "jalon" | "tache" | "reunion" | "diligence" | "livrable";

const KIND_STYLES: Record<Kind, { label: string; className: string }> = {
  jalon: { label: "Jalon", className: "bg-amber-100 text-amber-800" },
  tache: { label: "Tâche", className: "bg-brand-100 text-brand-800" },
  reunion: { label: "Réunion", className: "bg-sky-100 text-sky-800" },
  diligence: { label: "Diligence", className: "bg-violet-100 text-violet-800" },
  livrable: { label: "Livrable", className: "bg-emerald-100 text-emerald-800" },
};

type Item = { id: string; kind: Kind; date: Date; label: string; project: string; link: string };

const monthLabel = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const DAY_HEADERS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const key = (date: Date) => date.toISOString().slice(0, 10);

export default async function CalendarPage({ searchParams }: PageProps<"/calendrier">) {
  const user = await requireUser();
  const sp = await searchParams;
  const now = new Date();
  const monthParam = typeof sp.mois === "string" ? sp.mois : "";
  const projectFilter = typeof sp.projet === "string" ? sp.projet : "";
  const mineOnly = sp.moi === "1";

  const base = /^\d{4}-\d{2}$/.test(monthParam)
    ? new Date(`${monthParam}-01T00:00:00Z`)
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
  const end = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0, 23, 59, 59));
  const shift = (months: number) =>
    new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, 1)).toISOString().slice(0, 7);

  const visible = visibleProjectsWhere(user);
  const projectWhere = projectFilter ? { AND: [visible, { id: projectFilter }] } : visible;
  const projects = await db.project.findMany({
    where: visible,
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
  const inRange = { gte: start, lte: end };

  const [milestones, tasks, meetings, diligences, deliverables] = await Promise.all([
    db.milestone.findMany({
      where: { dueDate: inRange, project: projectWhere, ...(mineOnly ? { ownerId: user.id } : {}) },
      include: { project: { select: { id: true, code: true } } },
    }),
    db.workItem.findMany({
      where: {
        endDate: inRange,
        project: projectWhere,
        ...(mineOnly ? { OR: [{ ownerId: user.id }, { assignees: { some: { userId: user.id } } }] } : {}),
      },
      include: { project: { select: { id: true, code: true } } },
    }),
    db.meeting.findMany({
      where: {
        date: inRange,
        project: projectWhere,
        ...(mineOnly ? { participants: { some: { userId: user.id } } } : {}),
      },
      include: { project: { select: { id: true, code: true } } },
    }),
    db.diligence.findMany({
      where: { dueDate: inRange, project: projectWhere, ...(mineOnly ? { ownerId: user.id } : {}) },
      include: { project: { select: { id: true, code: true } } },
    }),
    db.deliverable.findMany({
      where: { dueDate: inRange, project: projectWhere, ...(mineOnly ? { ownerId: user.id } : {}) },
      include: { project: { select: { id: true, code: true } } },
    }),
  ]);

  const items: Item[] = [
    ...milestones.map((m) => ({ id: m.id, kind: "jalon" as const, date: m.dueDate, label: m.name, project: m.project.code, link: `/projets/${m.project.id}/jalons` })),
    ...tasks.map((t) => ({ id: t.id, kind: "tache" as const, date: t.endDate!, label: t.name, project: t.project.code, link: `/projets/${t.project.id}/planification` })),
    ...meetings.map((m) => ({ id: m.id, kind: "reunion" as const, date: m.date, label: m.subject, project: m.project.code, link: `/projets/${m.project.id}/reunions` })),
    ...diligences.map((d) => ({ id: d.id, kind: "diligence" as const, date: d.dueDate!, label: d.title, project: d.project.code, link: `/projets/${d.project.id}/diligences` })),
    ...deliverables.map((d) => ({ id: d.id, kind: "livrable" as const, date: d.dueDate!, label: d.name, project: d.project.code, link: `/projets/${d.project.id}/livrables` })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const byDay = new Map<string, Item[]>();
  for (const item of items) byDay.set(key(item.date), [...(byDay.get(key(item.date)) ?? []), item]);

  // Grille du mois, en commençant le lundi
  const firstWeekday = (start.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), i + 1))),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const query = (overrides: Record<string, string>) => {
    const params = new URLSearchParams();
    if (projectFilter) params.set("projet", projectFilter);
    if (mineOnly) params.set("moi", "1");
    params.set("mois", monthParam || shift(0));
    for (const [k, v] of Object.entries(overrides)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    return `/calendrier?${params}`;
  };

  return (
    <>
      <PageHeader
        title="Calendrier"
        description={`${items.length} échéance(s) en ${monthLabel.format(base)}`}
        actions={
          <div className="flex items-center gap-2">
            <Link href={query({ mois: shift(-1) })} className="btn btn-secondary" aria-label="Mois précédent">
              <ChevronLeft className="size-4" />
            </Link>
            <Link href={query({ mois: new Date().toISOString().slice(0, 7) })} className="btn btn-secondary">Ce mois</Link>
            <Link href={query({ mois: shift(1) })} className="btn btn-secondary" aria-label="Mois suivant">
              <ChevronRight className="size-4" />
            </Link>
          </div>
        }
      />

      <form className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <input type="hidden" name="mois" value={monthParam || shift(0)} />
        <div className="min-w-56 flex-1">
          <label className="label">Projet</label>
          <select name="projet" defaultValue={projectFilter} className="input">
            <option value="">Tous les projets</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-zinc-700">
          <input type="checkbox" name="moi" value="1" defaultChecked={mineOnly} className="accent-brand-600" />
          Uniquement mes échéances
        </label>
        <button className="btn btn-secondary">Filtrer</button>
      </form>

      <div className="mb-3 flex flex-wrap gap-3 text-xs">
        {Object.entries(KIND_STYLES).map(([kind, style]) => (
          <span key={kind} className={`rounded px-2 py-0.5 font-medium ${style.className}`}>{style.label}</span>
        ))}
      </div>

      <section className="card overflow-x-auto p-3">
        <div className="grid min-w-[46rem] grid-cols-7 gap-1">
          {DAY_HEADERS.map((day) => (
            <div key={day} className="pb-1 text-center text-xs font-semibold text-zinc-500">{day}</div>
          ))}
          {cells.map((date, index) => {
            const dayItems = date ? (byDay.get(key(date)) ?? []) : [];
            const isToday = date && key(date) === key(now);
            return (
              <div
                key={index}
                className={`min-h-24 rounded-lg border p-1 ${
                  date ? (isToday ? "border-brand-400 bg-brand-50" : "border-zinc-100") : "border-transparent"
                }`}
              >
                {date && <p className="mb-1 text-xs font-medium text-zinc-500">{date.getUTCDate()}</p>}
                <ul className="space-y-0.5">
                  {dayItems.map((item) => (
                    <li key={`${item.kind}-${item.id}`}>
                      <Link
                        href={item.link}
                        title={`${KIND_STYLES[item.kind].label} · ${item.project} — ${item.label}`}
                        className={`block truncate rounded px-1 py-0.5 text-[11px] ${KIND_STYLES[item.kind].className}`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {items.length > 0 && (
        <section className="card mt-6 overflow-x-auto">
          <h2 className="px-5 pt-5 pb-3 font-semibold text-brand-800">Liste des échéances</h2>
          <table className="data-table">
            <thead>
              <tr><th>Date</th><th>Type</th><th>Intitulé</th><th>Projet</th></tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={`${item.kind}-${item.id}`}>
                  <td className="whitespace-nowrap">{formatDate(item.date)}</td>
                  <td>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${KIND_STYLES[item.kind].className}`}>
                      {KIND_STYLES[item.kind].label}
                    </span>
                  </td>
                  <td><Link href={item.link} className="text-brand-700 hover:underline">{item.label}</Link></td>
                  <td className="font-mono text-xs">{item.project}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
