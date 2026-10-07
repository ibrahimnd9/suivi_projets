"use client";

import { useState } from "react";
import { FieldError, FormMessage, type FormState } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { useFormAction } from "@/components/use-form-action";
import { WORK_ITEM_LABELS } from "@/lib/planning-labels";
import type { WorkItemKind } from "@/generated/prisma/enums";

type Option = { id: string; label: string };

export type WorkItemValues = {
  kind: WorkItemKind;
  parentId: string | null;
  name: string;
  description: string | null;
  ownerId: string | null;
  statusId: string | null;
  priorityId: string | null;
  startDate: string | null;
  endDate: string | null;
  progress: string;
  plannedHours: string | null;
  sortOrder: number;
  assignees: string[];
};

export function WorkItemForm({
  action,
  values,
  kinds,
  parents,
  people,
  statuses,
  priorities,
  submitLabel,
  resetOnSuccess = false,
  compact = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  values?: WorkItemValues;
  kinds: WorkItemKind[];
  parents: Option[];
  people: Option[];
  statuses: Option[];
  priorities: Option[];
  submitLabel: string;
  resetOnSuccess?: boolean;
  compact?: boolean;
}) {
  const { state, action: formAction, onSubmit, pending } = useFormAction(action);
  const [assignees, setAssignees] = useState<string[]>(values?.assignees ?? []);
  const key = resetOnSuccess ? (state?.nonce ?? 0) : "form";

  const toggle = (id: string) =>
    setAssignees((current) => (current.includes(id) ? current.filter((v) => v !== id) : [...current, id]));

  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-4" key={key}>
      <input type="hidden" name="assignees" value={assignees.join(",")} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Niveau *</label>
          <select name="kind" defaultValue={values?.kind ?? kinds[0]} className="input">
            {kinds.map((kind) => (
              <option key={kind} value={kind}>{WORK_ITEM_LABELS[kind]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Rattaché à</label>
          <select name="parentId" defaultValue={values?.parentId ?? ""} className="input">
            <option value="">Racine du projet</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Intitulé *</label>
          <input name="name" defaultValue={values?.name} required className="input" />
          <FieldError state={state} name="name" />
        </div>
        {!compact && (
          <div className="sm:col-span-2">
            <label className="label">Description</label>
            <textarea name="description" rows={2} defaultValue={values?.description ?? ""} className="input" />
          </div>
        )}
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
          <label className="label">Statut</label>
          <select name="statusId" defaultValue={values?.statusId ?? ""} className="input">
            <option value="">—</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
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
        <div className="grid grid-cols-3 gap-3 sm:col-span-2">
          <div>
            <label className="label">Avancement (%)</label>
            <input
              name="progress"
              type="number"
              min="0"
              max="100"
              defaultValue={values?.progress ?? "0"}
              className="input"
            />
            <FieldError state={state} name="progress" />
          </div>
          <div>
            <label className="label">Temps prévu (h)</label>
            <input
              name="plannedHours"
              type="number"
              min="0"
              step="0.5"
              defaultValue={values?.plannedHours ?? ""}
              className="input"
            />
            <FieldError state={state} name="plannedHours" />
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
        </div>
        <input type="hidden" name="sortOrder" value={values?.sortOrder ?? 0} />

        {!compact && (
          <div className="sm:col-span-2">
            <label className="label">Collaborateurs</label>
            <div className="flex max-h-32 flex-wrap gap-x-4 gap-y-2 overflow-y-auto rounded-lg border border-zinc-300 bg-white px-3 py-2">
              {people.length === 0 && <span className="text-sm text-zinc-500">Aucun intervenant disponible.</span>}
              {people.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={assignees.includes(p.id)}
                    onChange={() => toggle(p.id)}
                    className="accent-brand-600"
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <FormMessage state={state} />
      <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
    </form>
  );
}
