import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { Badge, EmptyState, PageHeader, formatDateTime } from "@/components/ui";
import type { Prisma } from "@/generated/prisma/client";
import { AUDIT_ACTIONS, auditAction } from "@/lib/audit-labels";

export const metadata: Metadata = { title: "Journal de traçabilité" };

const PAGE_SIZE = 50;

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function JournalPage({ searchParams }: PageProps<"/admin/journal">) {
  await requirePermission("admin.audit");
  const sp = await searchParams;
  const q = str(sp.q).trim();
  const action = str(sp.action);
  const userId = str(sp.utilisateur);
  const from = str(sp.du);
  const to = str(sp.au);
  const page = Math.max(1, Number(str(sp.page)) || 1);

  const where: Prisma.AuditLogWhereInput = {
    ...(q && {
      OR: [
        { entity: { contains: q, mode: "insensitive" } },
        { entityLabel: { contains: q, mode: "insensitive" } },
        { field: { contains: q, mode: "insensitive" } },
        { oldValue: { contains: q, mode: "insensitive" } },
        { newValue: { contains: q, mode: "insensitive" } },
      ],
    }),
    ...(action && { action }),
    ...(userId && { userId }),
    ...((from || to) && {
      createdAt: {
        ...(from && { gte: new Date(`${from}T00:00:00`) }),
        ...(to && { lte: new Date(`${to}T23:59:59.999`) }),
      },
    }),
  };

  const [logs, total, users] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.auditLog.count({ where }),
    db.user.findMany({ orderBy: [{ lastName: "asc" }], select: { id: true, firstName: true, lastName: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageLink = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (action) params.set("action", action);
    if (userId) params.set("utilisateur", userId);
    if (from) params.set("du", from);
    if (to) params.set("au", to);
    params.set("page", String(p));
    return `/admin/journal?${params}`;
  };

  return (
    <>
      <PageHeader title="Journal de traçabilité" description={`${total} événement${total > 1 ? "s" : ""} enregistré${total > 1 ? "s" : ""}`} />

      <form className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_12rem_12rem_9.5rem_9.5rem_auto]">
        <input name="q" defaultValue={q} placeholder="Rechercher (objet, champ, valeur)…" className="input" />
        <select name="action" defaultValue={action} className="input" aria-label="Action">
          <option value="">Toutes les actions</option>
          {Object.entries(AUDIT_ACTIONS).map(([value, a]) => (
            <option key={value} value={value}>{a.label}</option>
          ))}
        </select>
        <select name="utilisateur" defaultValue={userId} className="input" aria-label="Utilisateur">
          <option value="">Tous les utilisateurs</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.lastName.toUpperCase()} {u.firstName}</option>
          ))}
        </select>
        <input type="date" name="du" defaultValue={from} className="input" aria-label="Du" />
        <input type="date" name="au" defaultValue={to} className="input" aria-label="Au" />
        <button className="btn btn-secondary">Filtrer</button>
      </form>

      <div className="card overflow-x-auto">
        {logs.length === 0 ? (
          <EmptyState>Aucun événement.</EmptyState>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Utilisateur</th>
                <th>Action</th>
                <th>Objet</th>
                <th>Donnée modifiée</th>
                <th>Ancienne valeur</th>
                <th>Nouvelle valeur</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const a = auditAction(log.action);
                return (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                    <td className="whitespace-nowrap">{log.userName ?? <span className="text-zinc-400">—</span>}</td>
                    <td><Badge tone={a.tone}>{a.label}</Badge></td>
                    <td>
                      <span className="text-xs text-zinc-500">{log.entity}</span>
                      <p>{log.entityLabel ?? "—"}</p>
                    </td>
                    <td>{log.field ?? "—"}</td>
                    <td className="max-w-48 truncate text-zinc-500" title={log.oldValue ?? ""}>{log.oldValue ?? "—"}</td>
                    <td className="max-w-48 truncate" title={log.newValue ?? ""}>{log.newValue ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-zinc-500">Page {page} / {pages}</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={pageLink(page - 1)} className="btn btn-secondary">Précédent</Link>}
            {page < pages && <Link href={pageLink(page + 1)} className="btn btn-secondary">Suivant</Link>}
          </div>
        </div>
      )}
    </>
  );
}
