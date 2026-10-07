"use client";

import type { ReactNode } from "react";
import { FormMessage, type FormState } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { useFormAction } from "@/components/use-form-action";

/** Petit formulaire générique : champs fournis en enfants, message d'erreur/succès global. */
export function ActionForm({
  action,
  children,
  submitLabel = "Enregistrer",
  className = "space-y-3",
  resetOnSuccess = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode;
  submitLabel?: string;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const { state, action: formAction, onSubmit, pending } = useFormAction(action);
  const key = resetOnSuccess ? (state?.nonce ?? 0) : "form";
  return (
    <form action={formAction} onSubmit={onSubmit} className={className} key={key}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
