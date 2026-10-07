import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { ActionForm } from "@/components/action-form";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { saveDirection, savePole, toggleOrgUnit } from "./actions";

export const metadata: Metadata = { title: "Directions & pôles" };

function CodeNameFields({ code, name }: { code?: string; name?: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
      <div>
        <label className="label">Code</label>
        <input name="code" defaultValue={code} required maxLength={20} className="input uppercase" />
      </div>
      <div>
        <label className="label">Libellé</label>
        <input name="name" defaultValue={name} required className="input" />
      </div>
    </div>
  );
}

function DirectionSelect({ directions, value }: { directions: { id: string; name: string }[]; value?: string }) {
  return (
    <div>
      <label className="label">Direction</label>
      <select name="directionId" defaultValue={value ?? ""} required className="input">
        <option value="" disabled>Choisir…</option>
        {directions.map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
    </div>
  );
}

function ToggleButton({ kind, id, active }: { kind: "direction" | "pole"; id: string; active: boolean }) {
  return (
    <form action={toggleOrgUnit.bind(null, kind, id)}>
      <SubmitButton className="btn btn-secondary px-2 py-1 text-xs" pendingLabel="…">
        {active ? "Désactiver" : "Réactiver"}
      </SubmitButton>
    </form>
  );
}

export default async function OrganisationPage() {
  await requirePermission("admin.organisation");
  const directions = await db.direction.findMany({
    orderBy: { name: "asc" },
    include: {
      poles: { orderBy: { name: "asc" }, include: { _count: { select: { users: true } } } },
      _count: { select: { users: true } },
    },
  });
  const activeDirections = directions.filter((d) => d.active);

  return (
    <>
      <PageHeader title="Directions & pôles" description="Structure organisationnelle utilisée pour les utilisateurs et les projets." />

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 font-semibold text-brand-800">Ajouter une direction</h2>
          <ActionForm action={saveDirection.bind(null, null)} submitLabel="Ajouter" resetOnSuccess>
            <CodeNameFields />
          </ActionForm>
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-semibold text-brand-800">Ajouter un pôle</h2>
          {activeDirections.length === 0 ? (
            <p className="text-sm text-zinc-500">Créez d’abord une direction.</p>
          ) : (
            <ActionForm action={savePole.bind(null, null)} submitLabel="Ajouter" resetOnSuccess>
              <CodeNameFields />
              <DirectionSelect directions={activeDirections} />
            </ActionForm>
          )}
        </section>
      </div>

      <div className="space-y-4">
        {directions.length === 0 && (
          <div className="card"><EmptyState>Aucune direction pour le moment.</EmptyState></div>
        )}
        {directions.map((d) => (
          <section key={d.id} className={`card relative ${d.active ? "" : "opacity-60"}`}>
            <header className="flex flex-wrap items-center gap-3 border-b border-zinc-100 px-5 py-3">
              <Badge tone="brand">{d.code}</Badge>
              <h3 className="font-semibold">{d.name}</h3>
              {!d.active && <Badge tone="red">Inactive</Badge>}
              <span className="text-xs text-zinc-500">
                {d.poles.length} pôle(s) · {d._count.users} utilisateur(s)
              </span>
              <div className="ml-auto flex items-center gap-2">
                <details className="group">
                  <summary className="btn btn-secondary cursor-pointer list-none px-2 py-1 text-xs">Modifier</summary>
                  <div className="absolute right-8 z-10 mt-2 w-[min(28rem,80vw)] rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
                    <ActionForm action={saveDirection.bind(null, d.id)}>
                      <CodeNameFields code={d.code} name={d.name} />
                    </ActionForm>
                  </div>
                </details>
                <ToggleButton kind="direction" id={d.id} active={d.active} />
              </div>
            </header>
            {d.poles.length === 0 ? (
              <p className="px-5 py-3 text-sm text-zinc-500">Aucun pôle.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {d.poles.map((p) => (
                  <li key={p.id} className={`relative flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm ${p.active ? "" : "opacity-60"}`}>
                    <span className="w-24 font-mono text-xs text-zinc-500">{p.code}</span>
                    <span>{p.name}</span>
                    {!p.active && <Badge tone="red">Inactif</Badge>}
                    <span className="text-xs text-zinc-500">{p._count.users} utilisateur(s)</span>
                    <div className="ml-auto flex items-center gap-2">
                      <details>
                        <summary className="btn btn-secondary cursor-pointer list-none px-2 py-1 text-xs">Modifier</summary>
                        <div className="absolute right-8 z-10 mt-2 w-[min(28rem,80vw)] rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
                          <ActionForm action={savePole.bind(null, p.id)}>
                            <CodeNameFields code={p.code} name={p.name} />
                            <DirectionSelect directions={activeDirections} value={p.directionId} />
                          </ActionForm>
                        </div>
                      </details>
                      <ToggleButton kind="pole" id={p.id} active={p.active} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
