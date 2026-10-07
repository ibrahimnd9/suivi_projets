import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { ImportForm } from "./import-form";
import { importProjects, importUsers } from "./actions";

export const metadata: Metadata = { title: "Import de données" };

export default async function ImportPage() {
  await requirePermission("admin.users");

  return (
    <>
      <PageHeader
        title="Import de données"
        description="Reprise initiale depuis Excel : enregistrez votre feuille au format CSV avant de l’importer."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-1 font-semibold text-brand-800">Utilisateurs</h2>
          <p className="mb-4 text-sm text-zinc-500">
            Un compte existant (même email) est mis à jour ; un nouveau compte reçoit un mot de passe temporaire.
          </p>
          <ImportForm
            action={importUsers}
            columns="Email*, Prénom*, Nom*, Profil, Fonction, Direction, Pôle, N+1 (email), Capacité"
            example={`Email;Prénom;Nom;Profil;Fonction;Direction;Pôle;N+1;Capacité
a.diallo@synapsys.sn;Aminata;Diallo;MANAGER;Cheffe de pôle;Direction Générale;Pôle Suivi-Évaluation;;40
m.sow@synapsys.sn;Moussa;Sow;UTILISATEUR;Analyste;Direction Générale;;a.diallo@synapsys.sn;35`}
          />
        </section>

        <section className="card p-5">
          <h2 className="mb-1 font-semibold text-brand-800">Projets</h2>
          <p className="mb-4 text-sm text-zinc-500">
            Un code projet existant met à jour la fiche ; sans code, un nouveau code est attribué automatiquement.
          </p>
          <ImportForm
            action={importProjects}
            columns="Code, Nom*, Description, Statut, Type, Direction, Chef de projet (email), Responsable (email), Début, Fin prévue, Budget"
            example={`Code;Nom;Statut;Type;Direction;Chef de projet;Début;Fin prévue;Budget
;Modernisation du réseau;En cours;Projet interne;Direction Générale;a.diallo@synapsys.sn;2026-01-15;2026-12-31;75000000
PRJ-2026-001;Déploiement des sites pilotes;En cours;;;;;;`}
          />
        </section>
      </div>

      <section className="card mt-6 p-5">
        <h2 className="mb-2 font-semibold text-brand-800">Comment préparer le fichier</h2>
        <ol className="list-inside list-decimal space-y-1 text-sm text-zinc-600">
          <li>Dans Excel, ouvrez votre feuille et vérifiez que la première ligne contient les en-têtes.</li>
          <li>Fichier → Enregistrer sous → format « CSV UTF-8 (délimité par des points-virgules) ».</li>
          <li>Importez ici : les lignes valides sont traitées, les autres sont listées avec leur motif de rejet.</li>
          <li>Les dates s’écrivent AAAA-MM-JJ ou JJ/MM/AAAA ; les montants sans espace ni symbole.</li>
        </ol>
        <p className="mt-3 text-xs text-zinc-500">
          Importez d’abord les utilisateurs, puis les projets : les chefs de projet sont reconnus par leur email.
        </p>
      </section>
    </>
  );
}
