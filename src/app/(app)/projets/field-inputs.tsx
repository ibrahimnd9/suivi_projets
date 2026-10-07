"use client";

import { FieldError, FormMessage, type FormState } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { useFormAction } from "@/components/use-form-action";
import { MULTISELECT_SEPARATOR } from "@/lib/custom-fields";
import type { FieldType } from "@/generated/prisma/enums";

export type FieldItem = {
  id: string;
  label: string;
  fieldType: FieldType;
  options: string[];
  unit: string | null;
  helpText: string | null;
  required: boolean;
  scope: "type" | "projet";
  value: string | null;
};

function Input({ field }: { field: FieldItem }) {
  const common = { id: field.id, name: field.id, required: field.required, className: "input" };
  switch (field.fieldType) {
    case "TEXTAREA":
      return <textarea {...common} rows={3} defaultValue={field.value ?? ""} />;
    case "NUMBER":
    case "AMOUNT":
    case "PERCENT":
      return (
        <input
          {...common}
          type="number"
          step="any"
          min={field.fieldType === "PERCENT" ? 0 : undefined}
          max={field.fieldType === "PERCENT" ? 100 : undefined}
          defaultValue={field.value ?? ""}
        />
      );
    case "DATE":
      return <input {...common} type="date" defaultValue={field.value?.slice(0, 10) ?? ""} />;
    case "URL":
      return <input {...common} type="url" placeholder="https://…" defaultValue={field.value ?? ""} />;
    case "CHECKBOX":
      return (
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            id={field.id}
            name={field.id}
            type="checkbox"
            defaultChecked={field.value === "true"}
            className="accent-brand-600"
          />
          Oui
        </label>
      );
    case "SELECT":
      return (
        <select {...common} defaultValue={field.value ?? ""}>
          <option value="">—</option>
          {field.options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      );
    case "MULTISELECT": {
      const selected = field.value ? field.value.split(MULTISELECT_SEPARATOR) : [];
      return (
        <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-lg border border-zinc-300 bg-white px-3 py-2">
          {field.options.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                name={field.id}
                value={option}
                defaultChecked={selected.includes(option)}
                className="accent-brand-600"
              />
              {option}
            </label>
          ))}
        </div>
      );
    }
    default:
      return <input {...common} defaultValue={field.value ?? ""} />;
  }
}

export function FieldValuesForm({
  action,
  fields,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  fields: FieldItem[];
}) {
  const { state, action: formAction, onSubmit, pending } = useFormAction(action);
  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field.id} className={field.fieldType === "TEXTAREA" ? "sm:col-span-2" : undefined}>
            <label className="label" htmlFor={field.id}>
              {field.label}
              {field.required && " *"}
              {field.unit && <span className="font-normal text-zinc-400"> ({field.unit})</span>}
              <span className="ml-2 text-[10px] font-normal tracking-wide text-zinc-400 uppercase">{field.scope}</span>
            </label>
            <Input field={field} />
            {field.helpText && <p className="mt-1 text-xs text-zinc-500">{field.helpText}</p>}
            <FieldError state={state} name={field.id} />
          </div>
        ))}
      </div>
      <FormMessage state={state} />
      <SubmitButton pending={pending}>Enregistrer les rubriques</SubmitButton>
    </form>
  );
}
