"use client";

import { useState } from "react";
import { FieldError, FormMessage, type FormState } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { useFormAction } from "@/components/use-form-action";
import { SecretBox } from "./secret-box";

type Option = { id: string; name: string };
type PoleOption = Option & { directionId: string };

export type UserFormValues = {
  firstName: string;
  lastName: string;
  email: string;
  profile: string;
  jobTitle: string | null;
  phone: string | null;
  directionId: string | null;
  poleId: string | null;
  managerId: string | null;
  weeklyCapacityHours: string;
};

export function UserForm({
  action,
  values,
  profiles,
  directions,
  poles,
  managers,
  submitLabel,
  resetOnSuccess = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  values?: UserFormValues;
  profiles: { value: string; label: string }[];
  directions: Option[];
  poles: PoleOption[];
  managers: Option[];
  submitLabel: string;
  resetOnSuccess?: boolean;
}) {
  const { state, action: formAction, onSubmit, pending } = useFormAction(action);
  const [directionId, setDirectionId] = useState(values?.directionId ?? "");
  const visiblePoles = poles.filter((p) => !directionId || p.directionId === directionId);

  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-5" key={resetOnSuccess ? (state?.nonce ?? 0) : "form"}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="firstName">Prénom *</label>
          <input className="input" id="firstName" name="firstName" defaultValue={values?.firstName} required />
          <FieldError state={state} name="firstName" />
        </div>
        <div>
          <label className="label" htmlFor="lastName">Nom *</label>
          <input className="input" id="lastName" name="lastName" defaultValue={values?.lastName} required />
          <FieldError state={state} name="lastName" />
        </div>
        <div>
          <label className="label" htmlFor="email">Email *</label>
          <input className="input" id="email" name="email" type="email" defaultValue={values?.email} required />
          <FieldError state={state} name="email" />
        </div>
        <div>
          <label className="label" htmlFor="profile">Profil *</label>
          <select className="input" id="profile" name="profile" defaultValue={values?.profile ?? "UTILISATEUR"}>
            {profiles.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <FieldError state={state} name="profile" />
        </div>
        <div>
          <label className="label" htmlFor="jobTitle">Fonction</label>
          <input className="input" id="jobTitle" name="jobTitle" defaultValue={values?.jobTitle ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="phone">Téléphone</label>
          <input className="input" id="phone" name="phone" defaultValue={values?.phone ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="directionId">Direction</label>
          <select
            className="input"
            id="directionId"
            name="directionId"
            value={directionId}
            onChange={(e) => setDirectionId(e.target.value)}
          >
            <option value="">—</option>
            {directions.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="poleId">Pôle</label>
          <select className="input" id="poleId" name="poleId" defaultValue={values?.poleId ?? ""} key={directionId}>
            <option value="">—</option>
            {visiblePoles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <FieldError state={state} name="poleId" />
        </div>
        <div>
          <label className="label" htmlFor="managerId">Supérieur hiérarchique (N+1)</label>
          <select className="input" id="managerId" name="managerId" defaultValue={values?.managerId ?? ""}>
            <option value="">—</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-zinc-500">Valide les fiches de temps de l’utilisateur.</p>
          <FieldError state={state} name="managerId" />
        </div>
        <div>
          <label className="label" htmlFor="weeklyCapacityHours">Capacité hebdomadaire (heures)</label>
          <input
            className="input"
            id="weeklyCapacityHours"
            name="weeklyCapacityHours"
            type="number"
            step="0.5"
            min="0"
            max="80"
            defaultValue={values?.weeklyCapacityHours ?? "40"}
          />
          <FieldError state={state} name="weeklyCapacityHours" />
        </div>
      </div>

      <FormMessage state={state} />
      {state?.secret && <SecretBox secret={state.secret} />}
      <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
    </form>
  );
}
