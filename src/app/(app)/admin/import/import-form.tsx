"use client";

import { FormMessage, type FormState } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { useFormAction } from "@/components/use-form-action";
import type { ImportReport } from "./actions";

export function ImportForm({
  action,
  columns,
  example,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  columns: string;
  example: string;
}) {
  const { state, action: formAction, onSubmit, pending } = useFormAction(action);
  const report: ImportReport | null = state?.report ? JSON.parse(state.report) : null;

  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-3">
      <p className="text-sm text-zinc-600">
        Colonnes reconnues : <span className="font-medium">{columns}</span>
      </p>
      <pre className="overflow-x-auto rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600">{example}</pre>
      <input name="file" type="file" accept=".csv,text/csv" required className="input py-1.5" />
      <SubmitButton pending={pending} pendingLabel="Import en cours…">Importer le fichier</SubmitButton>
      <FormMessage state={state} />

      {report && report.errors.length > 0 && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <p className="mb-1 font-semibold">Lignes ignorées</p>
          <ul className="list-inside list-disc">
            {report.errors.slice(0, 20).map((error, index) => (
              <li key={index}>Ligne {error.line} : {error.message}</li>
            ))}
          </ul>
          {report.errors.length > 20 && <p className="mt-1">… et {report.errors.length - 20} autre(s).</p>}
        </div>
      )}

      {report?.secrets && report.secrets.length > 0 && (
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm">
          <p className="mb-2 font-semibold text-brand-800">
            Mots de passe temporaires à communiquer (affichés une seule fois)
          </p>
          <table className="w-full text-left">
            <tbody>
              {report.secrets.map((secret) => (
                <tr key={secret.email}>
                  <td className="py-0.5 pr-4">{secret.email}</td>
                  <td className="font-mono font-semibold text-brand-800">{secret.password}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </form>
  );
}
