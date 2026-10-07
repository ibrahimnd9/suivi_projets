"use client";

import { useState, type ReactNode } from "react";
import { FieldError, FormMessage, type FormState } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { useFormAction } from "@/components/use-form-action";
import type { ProjectFormOptions } from "./form-options";

export type ProjectFormValues = {
  name: string;
  description: string | null;
  goal: string | null;
  objectives: string | null;
  typeId: string | null;
  categoryId: string | null;
  priorityId: string | null;
  statusId: string | null;
  directionId: string | null;
  poleId: string | null;
  sponsorId: string | null;
  ownerId: string | null;
  leadId: string | null;
  externalStakeholders: string | null;
  startDate: string | null;
  endDatePlanned: string | null;
  endDateActual: string | null;
  progress: string;
  strategic: boolean;
  strategicAxisId: string | null;
  strategicObjective: string | null;
  ptbaReference: string | null;
  ptbaActivity: string | null;
  budgetPlanned: string | null;
  fundingSourceId: string | null;
};

type Choice = { id: string; label?: string; name?: string; isDefault?: boolean };

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-zinc-100 pt-5 first:border-0 first:pt-0">
      <h2 className="mb-4 font-semibold text-brand-800">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Select({
  name,
  items,
  value,
  placeholder = "—",
  required = false,
}: {
  name: string;
  items: Choice[];
  value?: string | null;
  placeholder?: string;
  required?: boolean;
}) {
  const fallback = required ? (items.find((i) => i.isDefault)?.id ?? items[0]?.id ?? "") : "";
  return (
    <select id={name} name={name} defaultValue={value ?? fallback} required={required} className="input">
      {!required && <option value="">{placeholder}</option>}
      {items.map((item) => (
        <option key={item.id} value={item.id}>{item.label ?? item.name}</option>
      ))}
    </select>
  );
}

export function ProjectForm({
  action,
  options,
  values,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  options: ProjectFormOptions;
  values?: ProjectFormValues;
  submitLabel: string;
}) {
  const { state, action: formAction, onSubmit, pending } = useFormAction(action);
  const [directionId, setDirectionId] = useState(values?.directionId ?? "");
  const [strategic, setStrategic] = useState(values?.strategic ?? false);
  const poles = options.poles.filter((p) => !directionId || p.directionId === directionId);

  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-6">
      <Section title="Informations générales">
        <div className="sm:col-span-2">
          <Field label="Nom du projet *" htmlFor="name">
            <input id="name" name="name" defaultValue={values?.name} required className="input" />
            <FieldError state={state} name="name" />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Description" htmlFor="description">
            <textarea id="description" name="description" rows={3} defaultValue={values?.description ?? ""} className="input" />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Objectif général" htmlFor="goal">
            <textarea id="goal" name="goal" rows={2} defaultValue={values?.goal ?? ""} className="input" />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Objectifs spécifiques" htmlFor="objectives" hint="Un objectif par ligne.">
            <textarea id="objectives" name="objectives" rows={3} defaultValue={values?.objectives ?? ""} className="input" />
          </Field>
        </div>
        <Field label="Type de projet" htmlFor="typeId">
          <Select name="typeId" items={options.types} value={values?.typeId} />
        </Field>
        <Field label="Catégorie" htmlFor="categoryId">
          <Select name="categoryId" items={options.categories} value={values?.categoryId} />
        </Field>
        <Field label="Priorité" htmlFor="priorityId">
          <Select name="priorityId" items={options.priorities} value={values?.priorityId} />
        </Field>
        <Field label="Statut *" htmlFor="statusId">
          <Select name="statusId" items={options.statuses} value={values?.statusId} required />
          <FieldError state={state} name="statusId" />
        </Field>
      </Section>

      <Section title="Organisation et acteurs">
        <Field label="Direction porteuse" htmlFor="directionId">
          <select
            id="directionId"
            name="directionId"
            value={directionId}
            onChange={(e) => setDirectionId(e.target.value)}
            className="input"
          >
            <option value="">—</option>
            {options.directions.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Pôle" htmlFor="poleId">
          <select id="poleId" name="poleId" defaultValue={values?.poleId ?? ""} key={directionId} className="input">
            <option value="">—</option>
            {poles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <FieldError state={state} name="poleId" />
        </Field>
        <Field label="Sponsor" htmlFor="sponsorId">
          <Select name="sponsorId" items={options.people} value={values?.sponsorId} />
        </Field>
        <Field label="Responsable" htmlFor="ownerId" hint="Ajouté automatiquement à l’équipe du projet.">
          <Select name="ownerId" items={options.people} value={values?.ownerId} />
        </Field>
        <Field label="Chef de projet" htmlFor="leadId" hint="Ajouté automatiquement à l’équipe du projet.">
          <Select name="leadId" items={options.people} value={values?.leadId} />
        </Field>
        <Field label="Parties prenantes externes" htmlFor="externalStakeholders">
          <input
            id="externalStakeholders"
            name="externalStakeholders"
            defaultValue={values?.externalStakeholders ?? ""}
            className="input"
          />
        </Field>
      </Section>

      <Section title="Calendrier et avancement">
        <Field label="Date de début" htmlFor="startDate">
          <input id="startDate" name="startDate" type="date" defaultValue={values?.startDate ?? ""} className="input" />
        </Field>
        <Field label="Date de fin prévue" htmlFor="endDatePlanned">
          <input
            id="endDatePlanned"
            name="endDatePlanned"
            type="date"
            defaultValue={values?.endDatePlanned ?? ""}
            className="input"
          />
          <FieldError state={state} name="endDatePlanned" />
        </Field>
        <Field label="Date de fin réelle" htmlFor="endDateActual">
          <input
            id="endDateActual"
            name="endDateActual"
            type="date"
            defaultValue={values?.endDateActual ?? ""}
            className="input"
          />
        </Field>
        <Field
          label="Avancement (%)"
          htmlFor="progress"
          hint="Saisi manuellement ; il sera calculé à partir des tâches à l’étape suivante."
        >
          <input
            id="progress"
            name="progress"
            type="number"
            min="0"
            max="100"
            step="1"
            defaultValue={values?.progress ?? "0"}
            className="input"
          />
          <FieldError state={state} name="progress" />
        </Field>
      </Section>

      <Section title="Alignement stratégique et budget">
        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              name="strategic"
              checked={strategic}
              onChange={(e) => setStrategic(e.target.checked)}
              className="accent-brand-600"
            />
            Projet stratégique
          </label>
        </div>
        {strategic && (
          <>
            <Field label="Axe stratégique" htmlFor="strategicAxisId">
              <Select name="strategicAxisId" items={options.axes} value={values?.strategicAxisId} />
            </Field>
            <Field label="Objectif stratégique concerné" htmlFor="strategicObjective">
              <input
                id="strategicObjective"
                name="strategicObjective"
                defaultValue={values?.strategicObjective ?? ""}
                className="input"
              />
            </Field>
          </>
        )}
        <Field label="Lien avec le PTBA" htmlFor="ptbaReference">
          <input id="ptbaReference" name="ptbaReference" defaultValue={values?.ptbaReference ?? ""} className="input" />
        </Field>
        <Field label="Activité PTBA correspondante" htmlFor="ptbaActivity">
          <input id="ptbaActivity" name="ptbaActivity" defaultValue={values?.ptbaActivity ?? ""} className="input" />
        </Field>
        <Field label="Budget prévu (FCFA)" htmlFor="budgetPlanned">
          <input
            id="budgetPlanned"
            name="budgetPlanned"
            inputMode="decimal"
            defaultValue={values?.budgetPlanned ?? ""}
            className="input"
          />
          <FieldError state={state} name="budgetPlanned" />
        </Field>
        <Field label="Source de financement" htmlFor="fundingSourceId">
          <Select name="fundingSourceId" items={options.fundingSources} value={values?.fundingSourceId} />
        </Field>
      </Section>

      <FormMessage state={state} />
      <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
    </form>
  );
}
