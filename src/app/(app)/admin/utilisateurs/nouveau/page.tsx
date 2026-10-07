import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { createUser } from "../actions";
import { loadUserFormOptions } from "../form-options";
import { UserForm } from "../user-form";

export const metadata: Metadata = { title: "Nouvel utilisateur" };

export default async function NewUserPage() {
  await requirePermission("admin.users");
  const options = await loadUserFormOptions();

  return (
    <>
      <PageHeader
        title="Nouvel utilisateur"
        description="Un mot de passe temporaire est généré ; l’utilisateur le changera à sa première connexion."
        actions={<Link href="/admin/utilisateurs" className="btn btn-secondary">Retour à la liste</Link>}
      />
      <div className="card max-w-3xl p-6">
        <UserForm action={createUser} submitLabel="Créer le compte" resetOnSuccess {...options} />
      </div>
    </>
  );
}
