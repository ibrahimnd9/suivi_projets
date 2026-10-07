"use client";

import { useState } from "react";
import { FieldError, FormMessage, type FormState } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { useFormAction } from "@/components/use-form-action";
import { PTBA_ACTIVITY_STATUS_LABELS, QUARTERS } from "@/lib/strategy-labels";
import type { PtbaActivityStatus } from "@/generated/prisma/enums";

type Option = { id: string; label: string };

export type ActivityValues = {
  code: string;
  name: string;
  description: string | null;
  resultId: string | null;
  ownerId: string | null;
  directionId: string | null;
  startDate: string | null;
  endDate: string | null;
  priorityId: string | null;
  status: PtbaActivityStatus;
  progressManual: string | null;
  progressComment: string | null;
  q1: boolean;
  q2: boolean;
  q3: boolean;
  q4: boolean;
  budgetHr: string;
  budgetServices: string;
  budgetInvestment: string;
  budgetOperating: string;
  committed: string;
  paid: string;
  sortOrder: number;
  participants: string[];
};

const money = (value: string) => Number(value.replace(/\s/g, "").replace(",", ".")) || 0;

export function ActivityForm({
  action,
  yearId,
  values,
  results,
  people,
  directions,
  priorities,
  submitLabel,
  resetOnSuccess = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  yearId: string;
  values?: ActivityValues;
  results: Option[];
  people: Option[];
  directions: Option[];
  priorities: Option[];
  submitLabel: string;
  resetOnSuccess?: boolean;
}) {
  const { state, action: formAction, onSubmit, pending } = useFormAction(action);
  const [participants, setParticipants] = useState<string[]>(values?.participants ?? []);
  const [budget, setBudget] = useState({
    hr: values?.budgetHr ?? "0",
    services: values?.budgetServices ?? "0",
    investment: values?.budgetInvestment ?? "0",
    operating: values?.budgetOperating ?? "0",
  });
  const key = resetOnSuccess ? (state?.nonce ?? 0) : "form";
  const total = money(budget.hr) + money(budget.services) + money(budget.investment) + money(budget.operating);

  const toggle = (id: string) =>
    setParticipants((current) => (current.includes(id) ? current.filter((v) => v !== id) : [...current, id]));

  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-5" key={key}>
      <input type="hidden" name="yearId" value={yearId} />
      <input type="hidden" name="participants" value={participants.join(",")} />
      <input type="hidden" name="sortOrder" value={values?.sortOrder ?? 0} />

      <section>
        <h3 className="mb-3 text-sm font-semibold text-brand-800">Identification</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Code activité *</label>
            <input name="code" defaultValue={values?.code} required placeholder="1.3.1.6" className="input" />
            <FieldError state={state} name="code" />
          </div>
          <div>
            <label className="label">Résultat attendu</label>
            <select name="resultId" defaultValue={values?.resultId ?? ""} className="input">
              <option value="">—</option>
              {results.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Intitulé *</label>
            <input name="name" defaultValue={values?.name} required className="input" />
            <FieldError state={state} name="name" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Description détaillée</label>
            <textarea name="description" rows={2} defaultValue={values?.description ?? ""} className="input" />
          </div>
        </div>
      </section>

      <section className="border-t border-zinc-100 pt-4">
        <h3 className="mb-3 text-sm font-semibold text-brand-800">Exécution</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Responsable</label>
            <select name="ownerId" defaultValue={values?.ownerId ?? ""} className="input">
              <option value="">—</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Direction</label>
            <select name="directionId" defaultValue={values?.directionId ?? ""} className="input">
              <option value="">—</option>
              {directions.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Date de début</label>
            <input name="startDate" type="date" defaultValue={values?.startDate ?? ""} className="input" />
          </div>
          <div>
            <label className="label">Date de fin</label>
            <input name="endDate" type="date" defaultValue={values?.endDate ?? ""} className="input" />
            <FieldError state={state} name="endDate" />
          </div>
          <div>
            <label className="label">Priorité</label>
            <select name="priorityId" defaultValue={values?.priorityId ?? ""} className="input">
              <option value="">—</option>
              {priorities.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Statut</label>
            <select name="status" defaultValue={values?.status ?? "NON_DEMARREE"} className="input">
              {Object.entries(PTBA_ACTIVITY_STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Participants</label>
            <div className="flex max-h-32 flex-wrap gap-x-4 gap-y-2 overflow-y-auto rounded-lg border border-zinc-300 bg-white px-3 py-2">
              {people.length === 0 && <span className="text-sm text-zinc-500">Aucun utilisateur actif.</span>}
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
        </div>
      </section>

      <section className="border-t border-zinc-100 pt-4">
        <h3 className="mb-3 text-sm font-semibold text-brand-800">Planification trimestrielle *</h3>
        <div className="flex flex-wrap gap-4">
          {QUARTERS.map((quarter) => (
            <label key={quarter.key} className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                name={quarter.key}
                defaultChecked={values?.[quarter.key]}
                className="accent-brand-600"
              />
              {quarter.label}
            </label>
          ))}
        </div>
        <FieldError state={state} name="q1" />
      </section>

      <section className="border-t border-zinc-100 pt-4">
        <h3 className="mb-1 text-sm font-semibold text-brand-800">Budget prévu par nature</h3>
        <p className="mb-3 text-xs text-zinc-500">Total prévu : {total.toLocaleString("fr-FR")} FCFA</p>
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ["budgetHr", "Ressources humaines", "hr"],
            ["budgetServices", "Prestations", "services"],
            ["budgetInvestment", "Investissements", "investment"],
            ["budgetOperating", "Fonctionnement", "operating"],
          ].map(([name, label, key]) => (
            <div key={name}>
              <label className="label">{label}</label>
              <input
                name={name}
                inputMode="decimal"
                value={budget[key as keyof typeof budget]}
                onChange={(e) => setBudget((b) => ({ ...b, [key as string]: e.target.value }))}
                className="input"
              />
              <FieldError state={state} name={name} />
            </div>
          ))}
        </div>

        <h3 className="mt-4 mb-3 text-sm font-semibold text-brand-800">Budget exécuté</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Montant engagé</label>
            <input name="committed" inputMode="decimal" defaultValue={values?.committed ?? "0"} className="input" />
            <FieldError state={state} name="committed" />
          </div>
          <div>
            <label className="label">Montant payé</label>
            <input name="paid" inputMode="decimal" defaultValue={values?.paid ?? "0"} className="input" />
            <FieldError state={state} name="paid" />
          </div>
        </div>
      </section>

      <section className="border-t border-zinc-100 pt-4">
        <h3 className="mb-1 text-sm font-semibold text-brand-800">Avancement</h3>
        <p className="mb-3 text-xs text-zinc-500">
          Laissez vide pour que l’avancement soit calculé à partir des projets liés, au prorata de leur contribution.
        </p>
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <div>
            <label className="label">Avancement forcé (%)</label>
            <input
              name="progressManual"
              type="number"
              min="0"
              max="100"
              step="1"
              defaultValue={values?.progressManual ?? ""}
              className="input"
            />
            <FieldError state={state} name="progressManual" />
          </div>
          <div>
            <label className="label">Justification</label>
            <input name="progressComment" defaultValue={values?.progressComment ?? ""} className="input" />
            <FieldError state={state} name="progressComment" />
          </div>
        </div>
      </section>

      <FormMessage state={state} />
      <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
    </form>
  );
}
