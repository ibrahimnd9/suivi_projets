"use client";

import { login } from "./actions";
import { FormMessage } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { useFormAction } from "@/components/use-form-action";

export function LoginForm({ suite }: { suite?: string }) {
  const { state, action: formAction, onSubmit, pending } = useFormAction(login);
  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-4">
      {suite && <input type="hidden" name="suite" value={suite} />}
      <div>
        <label htmlFor="email" className="label">Adresse email</label>
        <input id="email" name="email" type="email" autoComplete="username" required autoFocus className="input" />
      </div>
      <div>
        <label htmlFor="password" className="label">Mot de passe</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      <FormMessage state={state} />
      <SubmitButton pending={pending} className="btn btn-primary w-full" pendingLabel="Connexion…">Se connecter</SubmitButton>
    </form>
  );
}
