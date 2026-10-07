"use client";

import { changePassword } from "./actions";
import { FieldError, FormMessage } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { useFormAction } from "@/components/use-form-action";

export function PasswordForm({ rules }: { rules: string }) {
  const { state, action: formAction, onSubmit, pending } = useFormAction(changePassword);
  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="current">Mot de passe actuel</label>
        <input className="input" id="current" name="current" type="password" autoComplete="current-password" required />
        <FieldError state={state} name="current" />
      </div>
      <div>
        <label className="label" htmlFor="next">Nouveau mot de passe</label>
        <input className="input" id="next" name="next" type="password" autoComplete="new-password" required />
        <p className="mt-1 text-xs text-zinc-500">{rules}</p>
        <FieldError state={state} name="next" />
      </div>
      <div>
        <label className="label" htmlFor="confirm">Confirmation</label>
        <input className="input" id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        <FieldError state={state} name="confirm" />
      </div>
      <FormMessage state={state} />
      <SubmitButton pending={pending}>Modifier le mot de passe</SubmitButton>
    </form>
  );
}
