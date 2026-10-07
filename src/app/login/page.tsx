import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { suite } = await searchParams;

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-brand-800 p-12 text-white lg:flex">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/synap-suivi-logo-blanc.svg" alt="SYNAP-SUIVI" className="w-80" />
        <div>
          <h2 className="text-3xl leading-tight font-bold">
            Suivre, piloter et consolider
            <br />
            l’ensemble des projets.
          </h2>
          <p className="mt-4 max-w-md text-brand-200">
            Portefeuille, planification, fiches de temps, indicateurs, risques et tableaux de bord réunis dans une
            base unique.
          </p>
        </div>
        <p className="text-xs text-brand-200">© SYNAPSYS — Pôle Suivi-Évaluation</p>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/synap-suivi-logo-couleur.svg" alt="SYNAP-SUIVI" className="mb-10 w-64 lg:hidden" />
          <h1 className="text-2xl font-bold text-brand-800">Connexion</h1>
          <p className="mt-1 mb-6 text-sm text-zinc-500">Identifiez-vous avec votre compte SYNAP-SUIVI.</p>
          <LoginForm suite={typeof suite === "string" ? suite : undefined} />
          <p className="mt-6 text-xs text-zinc-500">Mot de passe oublié ? Contactez l’administrateur de la plateforme.</p>
        </div>
      </section>
    </main>
  );
}
