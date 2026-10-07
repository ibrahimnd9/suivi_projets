"use client";

import { useState } from "react";
import { FormMessage, type FormState } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { useFormAction } from "@/components/use-form-action";
import { FIELD_TYPE_LABELS, FIELD_TYPES_WITH_OPTIONS, suggestFieldCode } from "@/lib/custom-fields";
import type { FieldType } from "@/generated/prisma/enums";

export type DefinitionValues = {
  label: string;
  code: string;
  fieldType: FieldType;
  options: string[];
  unit: string | null;
  helpText: string | null;
  required: boolean;
  sortOrder: number;
};

export function FieldDefinitionForm({
  action,
  values,
  submitLabel,
  resetOnSuccess = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  values?: DefinitionValues;
  submitLabel: string;
  resetOnSuccess?: boolean;
}) {
  const { state, action: formAction, onSubmit, pending } = useFormAction(action);
  const [fieldType, setFieldType] = useState<FieldType>(values?.fieldType ?? "TEXT");
  const [code, setCode] = useState(values?.code ?? "");
  const needsOptions = FIELD_TYPES_WITH_OPTIONS.includes(fieldType);
  const key = resetOnSuccess ? (state?.nonce ?? 0) : "form";

  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-4" key={key}>
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem_10rem_6rem]">
        <div>
          <label className="label">Libellé *</label>
          <input
            name="label"
            required
            defaultValue={values?.label}
            onChange={(e) => !values && setCode(suggestFieldCode(e.target.value))}
            className="input"
          />
        </div>
        <div>
          <label className="label">Type *</label>
          <select
            name="fieldType"
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value as FieldType)}
            className="input"
          >
            {Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Code</label>
          <input
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Généré du libellé"
            className="input font-mono text-xs uppercase"
          />
        </div>
        <div>
          <label className="label">Ordre</label>
          <input name="sortOrder" type="number" min="0" defaultValue={values?.sortOrder ?? 0} className="input" />
        </div>
      </div>

      {needsOptions && (
        <div>
          <label className="label">Valeurs possibles (une par ligne) *</label>
          <textarea name="options" rows={4} defaultValue={values?.options.join("\n")} className="input" />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
        <div>
          <label className="label">Unité</label>
          <input name="unit" defaultValue={values?.unit ?? ""} placeholder="ex. agents" className="input" />
        </div>
        <div>
          <label className="label">Aide à la saisie</label>
          <input name="helpText" defaultValue={values?.helpText ?? ""} className="input" />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-zinc-700">
          <input type="checkbox" name="required" defaultChecked={values?.required} className="accent-brand-600" />
          Obligatoire
        </label>
      </div>

      <FormMessage state={state} />
      <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
    </form>
  );
}
