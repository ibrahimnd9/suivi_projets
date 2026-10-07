import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { FIELD_TYPE_LABELS } from "@/lib/custom-fields";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { saveFieldDefinition, toggleFieldDefinition } from "@/app/(app)/projets/actions";
import { FieldDefinitionForm } from "@/app/(app)/projets/field-definition-form";

export const metadata: Metadata = { title: "Rubriques par type de projet" };

export default async function CustomFieldsAdminPage({ searchParams }: PageProps<"/admin/rubriques">) {
  await requirePermission("admin.customFields");
  const { type } = await searchParams;

  const types = await db.refItem.findMany({
    where: { kind: "PROJECT_TYPE" },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    include: { _count: { select: { customFields: true, projectsByType: true } } },
  });
  const current = types.find((t) => t.id === type) ?? types[0];

  const definitions = current
    ? await db.customFieldDef.findMany({
        where: { projectTypeId: current.id },
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      })
    : [];

  return (
    <>
      <PageHeader
        title="Rubriques par type de projet"
        description="Chaque type de projet porte ses propres rubriques : deux projets peuvent ainsi avoir des fiches différentes."
      />

      {types.length === 0 ? (
        <div className="card">
          <EmptyState>
            Créez d’abord des types de projet dans les{" "}
            <Link href="/admin/referentiels?liste=types-projet" className="text-brand-600 hover:underline">
              référentiels
            </Link>
            .
          </EmptyState>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
          <nav className="card h-fit p-2">
            {types.map((t) => (
              <Link
                key={t.id}
                href={`/admin/rubriques?type=${t.id}`}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                  t.id === current?.id ? "bg-brand-100 font-semibold text-brand-800" : "text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                <span>
                  {t.label}
                  {!t.active && <span className="ml-2 text-xs text-red-500">inactif</span>}
                </span>
                <span className="text-xs text-zinc-400">{t._count.customFields}</span>
              </Link>
            ))}
          </nav>

          <div className="space-y-6">
            <section className="card p-5">
              <h2 className="font-semibold text-brand-800">Ajouter une rubrique — {current?.label}</h2>
              <p className="mb-4 text-sm text-zinc-500">
                Elle apparaîtra sur les {current?._count.projectsByType ?? 0} projet(s) de ce type.
              </p>
              {current && (
                <FieldDefinitionForm
                  key={current.id}
                  action={saveFieldDefinition.bind(null, { projectTypeId: current.id }, null)}
                  submitLabel="Ajouter"
                  resetOnSuccess
                />
              )}
            </section>

            <section className="card">
              {definitions.length === 0 ? (
                <EmptyState>Aucune rubrique pour ce type de projet.</EmptyState>
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {definitions.map((definition) => (
                    <li key={definition.id} className="relative flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                      <span className="w-8 text-xs text-zinc-400">{definition.sortOrder}</span>
                      <span className="font-medium">{definition.label}</span>
                      <span className="font-mono text-xs text-zinc-500">{definition.code}</span>
                      <Badge tone="zinc">{FIELD_TYPE_LABELS[definition.fieldType]}</Badge>
                      {definition.required && <Badge tone="amber">Obligatoire</Badge>}
                      {!definition.active && <Badge tone="red">Inactive</Badge>}
                      <div className="ml-auto flex items-center gap-2">
                        <details>
                          <summary className="btn btn-secondary cursor-pointer list-none px-2 py-1 text-xs">Modifier</summary>
                          <div className="absolute right-4 z-10 mt-2 w-[min(46rem,85vw)] rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
                            <FieldDefinitionForm
                              action={saveFieldDefinition.bind(null, { projectTypeId: definition.projectTypeId! }, definition.id)}
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
          </div>
        </div>
      )}
    </>
  );
}
