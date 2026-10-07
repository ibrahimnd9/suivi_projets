"use client";

import { useState } from "react";
import { FormMessage, type FormState } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { useFormAction } from "@/components/use-form-action";

type Option = { id: string; label: string };

export type MeetingValues = {
  date: string;
  typeId: string | null;
  subject: string;
  location: string | null;
  minutes: string | null;
  participants: string[];
};

export function MeetingForm({
  action,
  values,
  types,
  people,
  submitLabel,
  resetOnSuccess = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  values?: MeetingValues;
  types: Option[];
  people: Option[];
  submitLabel: string;
  resetOnSuccess?: boolean;
}) {
  const { state, action: formAction, onSubmit, pending } = useFormAction(action);
  const [participants, setParticipants] = useState<string[]>(values?.participants ?? []);
  const key = resetOnSuccess ? (state?.nonce ?? 0) : "form";

  const toggle = (id: string) =>
    setParticipants((current) => (current.includes(id) ? current.filter((v) => v !== id) : [...current, id]));

  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-3" key={key}>
      <input type="hidden" name="participants" value={participants.join(",")} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Date et heure *</label>
          <input name="date" type="datetime-local" defaultValue={values?.date} required className="input" />
        </div>
        <div>
          <label className="label">Type de réunion</label>
          <select name="typeId" defaultValue={values?.typeId ?? ""} className="input">
            <option value="">—</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Objet *</label>
          <input name="subject" defaultValue={values?.subject} required className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Lieu</label>
          <input name="location" defaultValue={values?.location ?? ""} placeholder="Salle, visioconférence…" className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Participants</label>
          <div className="flex max-h-32 flex-wrap gap-x-4 gap-y-2 overflow-y-auto rounded-lg border border-zinc-300 bg-white px-3 py-2">
            {people.length === 0 && <span className="text-sm text-zinc-500">Aucun intervenant sur ce projet.</span>}
            {people.map((person) => (
              <label key={person.id} className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={participants.includes(person.id)}
                  onChange={() => toggle(person.id)}
                  className="accent-brand-600"
                />
                {person.label}
              </label>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Compte rendu</label>
          <textarea name="minutes" rows={4} defaultValue={values?.minutes ?? ""} className="input" />
        </div>
      </div>
      <FormMessage state={state} />
      <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
    </form>
  );
}
