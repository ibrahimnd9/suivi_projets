import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { REF_KINDS, refKindBySlug } from "@/lib/referentiels";
import { ActionForm } from "@/components/action-form";
import { Badge, ColorDot, EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { saveRefItem, toggleRefItem } from "./actions";

export const metadata: Metadata = { title: "Référentiels" };

function RefFields({
  item,
}: {
  item?: { code: string; label: string; color: string | null; sortOrder: number; isDefault: boolean };
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-[9rem_1fr_5rem_5.5rem]">
      <div>
        <label className="label">Code</label>
        <input name="code" defaultValue={item?.code} required maxLength={30} className="input uppercase" />
      </div>
      <div>
        <label className="label">Libellé</label>
        <input name="label" defaultValue={item?.label} required className="input" />
      </div>
      <div>
        <label className="label">Couleur</label>
        <input name="color" type="color" defaultValue={item?.color ?? "#624da0"} className="input h-[38px] p-1" />
      </div>
      <div>
        <label className="label">Ordre</label>
        <input name="sortOrder" type="number" min={0} defaultValue={item?.sortOrder ?? 0} className="input" />
      </div>
      <label className="flex items-center gap-2 text-sm text-zinc-700 sm:col-span-4">
        <input type="checkbox" name="isDefault" defaultChecked={item?.isDefault} className="accent-brand-600" />
        Valeur proposée par défaut
      </label>
    </div>
  );
}

export default async function ReferentielsPage({ searchParams }: PageProps<"/admin/referentiels">) {
  await requirePermission("admin.referentiels");
  const { liste } = await searchParams;
  const current = refKindBySlug(typeof liste === "string" ? liste : "") ?? REF_KINDS[0];

  const [items, counts] = await Promise.all([
    db.refItem.findMany({ where: { kind: current.kind }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] }),
    db.refItem.groupBy({ by: ["kind"], _count: true }),
  ]);
  const nextOrder = (items.at(-1)?.sortOrder ?? 0) + 10;

  return (
    <>
      <PageHeader
        title="Référentiels"
        description="Listes de valeurs paramétrables, utilisées dans l’ensemble de l’application sans modification du code."
      />

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <nav className="card h-fit p-2">
          {REF_KINDS.map((k) => (
            <Link
              key={k.kind}
              href={`/admin/referentiels?liste=${k.slug}`}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                k.kind === current.kind ? "bg-brand-100 font-semibold text-brand-800" : "text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {k.label}
              <span className="text-xs text-zinc-400">{counts.find((c) => c.kind === k.kind)?._count ?? 0}</span>
            </Link>
          ))}
        </nav>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="font-semibold text-brand-800">{current.label}</h2>
            <p className="mb-4 text-sm text-zinc-500">{current.description}</p>
            <ActionForm
              key={current.kind}
              action={saveRefItem.bind(null, current.kind, null)}
              submitLabel="Ajouter"
              resetOnSuccess
            >
              <RefFields item={{ code: "", label: "", color: null, sortOrder: nextOrder, isDefault: false }} />
            </ActionForm>
          </section>

          <section className="card">
            {items.length === 0 ? (
              <EmptyState>Aucune valeur dans cette liste.</EmptyState>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {items.map((item) => (
                  <li key={item.id} className={`relative flex flex-wrap items-center gap-3 px-5 py-3 text-sm ${item.active ? "" : "opacity-60"}`}>
                    <span className="w-10 text-xs text-zinc-400">{item.sortOrder}</span>
                    <ColorDot color={item.color} />
                    <span className="font-medium">{item.label}</span>
                    <span className="font-mono text-xs text-zinc-500">{item.code}</span>
                    {item.isDefault && <Badge tone="brand">Par défaut</Badge>}
                    {!item.active && <Badge tone="red">Inactif</Badge>}
                    <div className="ml-auto flex items-center gap-2">
                      <details>
                        <summary className="btn btn-secondary cursor-pointer list-none px-2 py-1 text-xs">Modifier</summary>
                        <div className="absolute right-4 z-10 mt-2 w-[min(40rem,85vw)] rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
                          <ActionForm action={saveRefItem.bind(null, item.kind, item.id)}>
                            <RefFields item={item} />
                          </ActionForm>
                        </div>
                      </details>
                      <form action={toggleRefItem.bind(null, item.id)}>
                        <SubmitButton className="btn btn-secondary px-2 py-1 text-xs" pendingLabel="…">
                          {item.active ? "Désactiver" : "Réactiver"}
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
    </>
  );
}
