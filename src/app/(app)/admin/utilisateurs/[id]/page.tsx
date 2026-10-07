import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission, displayName } from "@/lib/auth/session";
import { Badge, PageHeader, formatDateTime } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { setUserActive, updateUser } from "../actions";
import { loadUserFormOptions } from "../form-options";
import { UserForm } from "../user-form";
import { ResetPasswordButton } from "./reset-password";
import { auditAction } from "@/lib/audit-labels";

export const metadata: Metadata = { title: "Utilisateur" };

export default async function EditUserPage({ params }: PageProps<"/admin/utilisateurs/[id]">) {
  const actor = await requirePermission("admin.users");
  const { id } = await params;
  const user = await db.user.findUnique({ where: { id } });
  if (!user) notFound();

  const [options, history, reports] = await Promise.all([
    loadUserFormOptions(user.id),
    db.auditLog.findMany({
      where: { entity: "Utilisateur", entityId: user.id },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    db.user.count({ where: { managerId: user.id, active: true } }),
  ]);
  const isSelf = user.id === actor.id;
  const locked = user.lockedUntil && user.lockedUntil > new Date();

  return (
    <>
      <PageHeader
        title={displayName(user)}
        description={user.email}
        actions={<Link href="/admin/utilisateurs" className="btn btn-secondary">Retour à la liste</Link>}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <section className="card p-6">
          <h2 className="mb-4 font-semibold text-brand-800">Informations</h2>
          <UserForm
            action={updateUser.bind(null, user.id)}
            submitLabel="Enregistrer"
            values={{
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              profile: user.profile,
              jobTitle: user.jobTitle,
              phone: user.phone,
              directionId: user.directionId,
              poleId: user.poleId,
              managerId: user.managerId,
              weeklyCapacityHours: user.weeklyCapacityHours.toString(),
            }}
            {...options}
          />
        </section>

        <div className="space-y-6">
          <section className="card space-y-3 p-6 text-sm">
            <h2 className="font-semibold text-brand-800">Compte</h2>
            <div className="flex flex-wrap gap-2">
              {user.active ? <Badge tone="green">Actif</Badge> : <Badge tone="red">Désactivé</Badge>}
              {user.mustChangePassword && <Badge tone="amber">Mot de passe à changer</Badge>}
              {locked && <Badge tone="red">Verrouillé</Badge>}
            </div>
            <p className="text-zinc-500">Dernière connexion : {formatDateTime(user.lastLoginAt)}</p>
            <p className="text-zinc-500">Créé le : {formatDateTime(user.createdAt)}</p>
            <p className="text-zinc-500">Collaborateurs rattachés (N-1) : {reports}</p>

            <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
              <ResetPasswordButton userId={user.id} />
              {!isSelf && (
                <form action={setUserActive.bind(null, user.id, !user.active)}>
                  <SubmitButton
                    className={user.active ? "btn btn-danger" : "btn btn-secondary"}
                    pendingLabel="…"
                    confirm={user.active ? "Désactiver ce compte ? L’utilisateur sera déconnecté." : undefined}
                  >
                    {user.active ? "Désactiver" : "Réactiver"}
                  </SubmitButton>
                </form>
              )}
            </div>
          </section>

          <section className="card p-6">
            <h2 className="mb-3 font-semibold text-brand-800">Historique</h2>
            {history.length === 0 ? (
              <p className="text-sm text-zinc-500">Aucune action enregistrée.</p>
            ) : (
              <ol className="space-y-3 text-sm">
                {history.map((h) => (
                  <li key={h.id} className="border-l-2 border-brand-200 pl-3">
                    <p className="text-xs text-zinc-500">
                      {formatDateTime(h.createdAt)} · {h.userName ?? "Système"}
                    </p>
                    <p>
                      {h.field ? (
                        <>
                          <span className="font-medium">{h.field}</span> : {h.oldValue ?? "—"} → {h.newValue ?? "—"}
                        </>
                      ) : (
                        auditAction(h.action).label
                      )}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
