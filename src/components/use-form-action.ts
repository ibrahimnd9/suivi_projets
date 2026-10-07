"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import type { FormState } from "@/components/ui";

/**
 * Comme useActionState, mais sans la réinitialisation automatique du formulaire
 * de React 19 : la saisie est conservée quand le serveur renvoie une erreur.
 * `action` reste branché sur le formulaire pour qu'un envoi avant l'hydratation
 * passe tout de même par l'action serveur (POST), jamais par l'URL.
 */
export function useFormAction(action: (state: FormState, formData: FormData) => Promise<FormState>) {
  const [state, dispatch, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await action(prev, formData);
    // Compteur incrémenté aux seuls succès : sert de clé pour vider un formulaire.
    // Sur une erreur, il reste identique, ce qui conserve la saisie de l'utilisateur.
    const nonce = prev?.nonce ?? 0;
    return result ? { ...result, nonce: result.success ? nonce + 1 : nonce } : result;
  }, undefined);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  };
  return { state, action: dispatch, onSubmit, pending };
}
