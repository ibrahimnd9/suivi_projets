import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { PROFILE_LABELS } from "@/lib/auth/permissions";
import { Badge, EmptyState, PageHeader, formatDateTime } from "@/components/ui";
import type { Prisma } from "@/generated/prisma/client";
import { Profile } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Utilisateurs" };

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function UsersPage({ searchParams }: PageProps<"/admin/utilisateurs">) {
  await requirePermission("admin.users");
  const sp = await searchParams;
  const q = str(sp.q).trim();
  const profile = str(sp.profil);
  const directionId = str(sp.direction);
  const statut = str(sp.statut) || "actifs";

  const where: Prisma.UserWhereInput = {
    ...(q && {
      OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { jobTitle: { contains: q, mode: "insensitive" } },
      ],
    }),
    ...(profile in Profile && { profile: profile as Profile }),
    ...(directionId && { directionId }),
    ...(statut === "actifs" && { active: true }),
    ...(statut === "inactifs" && { active: false }),
  };

  const [users, directions] = await Promise.all([
    db.user.findMany({
      where,
      include: { direction: true, pole: true, manager: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    db.direction.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Utilisateurs"
        description={`${users.length} utilisateur${users.length > 1 ? "s" : ""}`}
        actions={
          <Link href="/admin/utilisateurs/nouveau" className="btn btn-primary">
            <Plus className="size-4" /> Nouvel utilisateur
          </Link>
        }
      />

      <form className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_12rem_14rem_10rem_auto]">
        <input name="q" defaultValue={q} placeholder="Rechercher (nom, email, fonction)…" className="input" />
        <select name="profil" defaultValue={profile} className="input" aria-label="Profil">
          <option value="">Tous les profils</option>
          {Object.entries(PROFILE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select name="direction" defaultValue={directionId} className="input" aria-label="Direction">
          <option value="">Toutes les directions</option>
          {directions.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select name="statut" defaultValue={statut} className="input" aria-label="Statut">
          <option value="actifs">Actifs</option>
          <option value="inactifs">Désactivés</option>
          <option value="tous">Tous</option>
        </select>
        <button className="btn btn-secondary">Filtrer</button>
      </form>

      <div className="card overflow-x-auto">
        {users.length === 0 ? (
          <EmptyState>Aucun utilisateur ne correspond à ces critères.</EmptyState>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Profil</th>
                <th>Direction / Pôle</th>
                <th>N+1</th>
                <th>Dernière connexion</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link href={`/admin/utilisateurs/${u.id}`} className="font-semibold text-brand-700 hover:underline">
                      {u.lastName.toUpperCase()} {u.firstName}
                    </Link>
                    <p className="text-xs text-zinc-500">{u.email}{u.jobTitle ? ` · ${u.jobTitle}` : ""}</p>
                  </td>
                  <td><Badge tone={u.profile === "ADMIN" ? "brand" : "zinc"}>{PROFILE_LABELS[u.profile]}</Badge></td>
                  <td>
                    {u.direction?.name ?? "—"}
                    {u.pole && <p className="text-xs text-zinc-500">{u.pole.name}</p>}
                  </td>
                  <td>{u.manager ? `${u.manager.firstName} ${u.manager.lastName}` : "—"}</td>
                  <td className="whitespace-nowrap">{formatDateTime(u.lastLoginAt)}</td>
                  <td>{u.active ? <Badge tone="green">Actif</Badge> : <Badge tone="red">Désactivé</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
