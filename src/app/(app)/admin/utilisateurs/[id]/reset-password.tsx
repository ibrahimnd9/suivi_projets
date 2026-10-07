"use client";

import { useActionState } from "react";
import { resetPassword } from "../actions";
import { FormMessage } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { SecretBox } from "../secret-box";

export function ResetPasswordButton({ userId }: { userId: string }) {
  const [state, action] = useActionState(resetPassword.bind(null, userId), undefined);
  return (
    <form action={action} className="w-full space-y-3">
      <SubmitButton
        className="btn btn-secondary"
        pendingLabel="Réinitialisation…"
        confirm="Générer un nouveau mot de passe temporaire ? L’utilisateur sera déconnecté."
      >
        Réinitialiser le mot de passe
      </SubmitButton>
      <FormMessage state={state} />
      {state?.secret && <SecretBox secret={state.secret} />}
    </form>
  );
}
