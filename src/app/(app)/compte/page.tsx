import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { PROFILE_LABELS } from "@/lib/auth/permissions";
import { PASSWORD_RULES } from "@/lib/auth/password";
import { PageHeader, formatDateTime } from "@/components/ui";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Mon compte" };

export default async function AccountPage({ searchParams }: PageProps<"/compte">) {
  const user = await requireUser({ allowPendingPassword: true });
  const { premiere } = await searchParams;

  return (
    <>
      <PageHeader title="Mon compte" />
      {(premiere || user.mustChangePassword) && (
        <div className="mb-6 rounded-lg bg-brand-100 px-4 py-3 text-sm text-brand-800">
          Pour sécuriser votre compte, choisissez un mot de passe personnel avant de continuer.
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="mb-4 font-semibold text-brand-800">Informations</h2>
          <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
            <dt className="text-zinc-500">Nom</dt><dd>{user.firstName} {user.lastName}</dd>
            <dt className="text-zinc-500">Email</dt><dd>{user.email}</dd>
            <dt className="text-zinc-500">Profil</dt><dd>{PROFILE_LABELS[user.profile]}</dd>
            <dt className="text-zinc-500">Fonction</dt><dd>{user.jobTitle ?? "—"}</dd>
            <dt className="text-zinc-500">Direction</dt><dd>{user.direction?.name ?? "—"}</dd>
            <dt className="text-zinc-500">Pôle</dt><dd>{user.pole?.name ?? "—"}</dd>
            <dt className="text-zinc-500">Dernière connexion</dt><dd>{formatDateTime(user.lastLoginAt)}</dd>
          </dl>
        </section>
        <section className="card p-6">
          <h2 className="mb-4 font-semibold text-brand-800">Changer mon mot de passe</h2>
          <PasswordForm rules={PASSWORD_RULES} />
        </section>
      </div>
    </>
  );
}
