import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { canEditProject, can } from "@/lib/auth/permissions";
import { getVisibleProject, projectFields } from "@/lib/projects";
import { FIELD_TYPE_LABELS, formatFieldValue } from "@/lib/custom-fields";
import { Badge, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { saveFieldDefinition, saveFieldValues, toggleFieldDefinition } from "@/app/(app)/projets/actions";
import { FieldValuesForm, type FieldItem } from "@/app/(app)/projets/field-inputs";
import { FieldDefinitionForm } from "@/app/(app)/projets/field-definition-form";

export default async function ProjectFieldsPage({ params }: PageProps<"/projets/[id]/champs">) {
  const user = await requireUser();
  const { id } = await params;
  const project = await getVisibleProject(id, user);
  if (!project) notFound();
  const editable = canEditProject(user, project);

  const fields = await projectFields(project);
  const items: FieldItem[] = fields.map(({ definition, value }) => ({
    id: definition.id,
    label: definition.label,
    fieldType: definition.fieldType,
    options: definition.options,
    unit: definition.unit,
    helpText: definition.helpText,
    required: definition.required,
    scope: definition.projectId ? "projet" : "type",
    value,
  }));
  const ownFields = fields.filter((f) => f.definition.projectId === project.id);

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <h2 className="font-semibold text-brand-800">Rubriques du projet</h2>
        <p className="mb-5 text-sm text-zinc-500">
          Les rubriques marquées « type » viennent du type de projet
          {project.type ? ` « ${project.type.label} »` : ""} ; celles marquées « projet » n’existent que pour ce projet.
        </p>

        {items.length === 0 ? (
          <EmptyState>
            Aucune rubrique pour ce projet.
            {can(user.profile, "admin.customFields") && (
              <>
                {" "}
                <Link href="/admin/rubriques" className="text-brand-600 hover:underline">
                  Définir des rubriques par type de projet
                </Link>
                .
              </>
            )}
          </EmptyState>
        ) : editable ? (
          <FieldValuesForm action={saveFieldValues.bind(null, project.id)} fields={items} />
        ) : (
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {items.map((field) => (
              <div key={field.id} className="flex justify-between gap-4 border-b border-zinc-50 py-1">
                <dt className="text-zinc-500">{field.label}</dt>
                <dd className="text-right font-medium">
                  {formatFieldValue(
                    { label: field.label, fieldType: field.fieldType, options: field.options, unit: field.unit, required: field.required },
                    field.value,
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {editable && (
        <section className="card p-6">
          <h2 className="font-semibold text-brand-800">Ajouter une rubrique propre à ce projet</h2>
          <p className="mb-5 text-sm text-zinc-500">
            Exemples : numéro de convention, nombre de bénéficiaires, région couverte…
          </p>
          <FieldDefinitionForm
            action={saveFieldDefinition.bind(null, { projectId: project.id }, null)}
            submitLabel="Ajouter la rubrique"
            resetOnSuccess
          />

          {ownFields.length > 0 && (
            <ul className="mt-6 divide-y divide-zinc-100 border-t border-zinc-100">
              {ownFields.map(({ definition }) => (
                <li key={definition.id} className="relative flex flex-wrap items-center gap-3 py-3 text-sm">
                  <span className="w-8 text-xs text-zinc-400">{definition.sortOrder}</span>
                  <span className="font-medium">{definition.label}</span>
                  <Badge tone="zinc">{FIELD_TYPE_LABELS[definition.fieldType]}</Badge>
                  {definition.required && <Badge tone="amber">Obligatoire</Badge>}
                  {!definition.active && <Badge tone="red">Inactive</Badge>}
                  <div className="ml-auto flex items-center gap-2">
                    <details>
                      <summary className="btn btn-secondary cursor-pointer list-none px-2 py-1 text-xs">Modifier</summary>
                      <div className="absolute right-0 z-10 mt-2 w-[min(46rem,85vw)] rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
                        <FieldDefinitionForm
                          action={saveFieldDefinition.bind(null, { projectId: project.id }, definition.id)}
                          submitLabel="Enregistrer"
                          values={{
                            label: definition.label,
                            code: definition.code,
                            fieldType: definition.fieldType,
                            options: definition.options,
                            unit: definition.unit,
                            helpText: definition.helpText,
                            required: definition.required,
                            sortOrder: definition.sortOrder,
                          }}
                        />
                      </div>
                    </details>
                    <form action={toggleFieldDefinition.bind(null, definition.id)}>
                      <SubmitButton className="btn btn-secondary px-2 py-1 text-xs" pendingLabel="…">
                        {definition.active ? "Désactiver" : "Réactiver"}
                      </SubmitButton>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
