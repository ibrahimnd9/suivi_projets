import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, displayName } from "@/lib/auth/session";
import { canEditProject } from "@/lib/auth/permissions";
import { getVisibleProject } from "@/lib/projects";
import { Badge, EmptyState, RefBadge, formatDate, formatDateTime } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { MeetingForm } from "@/app/(app)/projets/meeting-form";
import { deleteDecision, deleteMeeting, saveDecision, saveMeeting } from "@/app/(app)/projets/documents-actions";
import { DecisionStatus } from "@/generated/prisma/enums";

const DECISION_LABELS: Record<DecisionStatus, string> = {
  PRISE: "Prise",
  APPLIQUEE: "Appliquée",
  ANNULEE: "Annulée",
};

const DECISION_TONES: Record<DecisionStatus, "brand" | "green" | "zinc"> = {
  PRISE: "brand",
  APPLIQUEE: "green",
  ANNULEE: "zinc",
};

const asInputDateTime = (d: Date) => d.toISOString().slice(0, 16);
const asInputDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

function DecisionFields({
  values,
  people,
  meetings,
}: {
  values?: {
    title: string;
    description: string | null;
    decidedAt: Date;
    decidedById: string | null;
    meetingId: string | null;
    status: DecisionStatus;
  };
  people: { id: string; label: string }[];
  meetings: { id: string; label: string }[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label">Décision *</label>
        <input name="title" defaultValue={values?.title} required className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Description</label>
        <input name="description" defaultValue={values?.description ?? ""} className="input" />
      </div>
      <div>
        <label className="label">Date *</label>
        <input
          name="decidedAt"
          type="date"
          defaultValue={values ? asInputDate(values.decidedAt) : new Date().toISOString().slice(0, 10)}
          required
          className="input"
        />
      </div>
      <div>
        <label className="label">Statut</label>
        <select name="status" defaultValue={values?.status ?? DecisionStatus.PRISE} className="input">
          {Object.entries(DECISION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Décidée par</label>
        <select name="decidedById" defaultValue={values?.decidedById ?? ""} className="input">
          <option value="">—</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Réunion d’origine</label>
        <select name="meetingId" defaultValue={values?.meetingId ?? ""} className="input">
          <option value="">—</option>
          {meetings.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default async function ProjectMeetingsPage({ params }: PageProps<"/projets/[id]/reunions">) {
  const user = await requireUser();
  const { id } = await params;
  const project = await getVisibleProject(id, user);
  if (!project) notFound();
  const editable = canEditProject(user, project);

  const [meetings, decisions, types] = await Promise.all([
    db.meeting.findMany({
      where: { projectId: id },
      include: {
        type: true,
        participants: { include: { user: true } },
        decisions: true,
        diligences: { include: { status: true, owner: true } },
      },
      orderBy: { date: "desc" },
    }),
    db.decision.findMany({
      where: { projectId: id },
      include: { decidedBy: true, meeting: true },
      orderBy: { decidedAt: "desc" },
    }),
    db.refItem.findMany({ where: { kind: "MEETING_TYPE", active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  const people = project.members.map((m) => ({ id: m.userId, label: displayName(m.user) }));
  const typeOptions = types.map((t) => ({ id: t.id, label: t.label }));
  const meetingOptions = meetings.map((m) => ({ id: m.id, label: `${formatDate(m.date)} — ${m.subject}` }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Réunions", meetings.length],
          ["Décisions", decisions.length],
          ["Appliquées", decisions.filter((d) => d.status === "APPLIQUEE").length],
          ["Actions issues des réunions", meetings.reduce((sum, m) => sum + m.diligences.length, 0)],
        ].map(([label, value]) => (
          <div key={label as string} className="card p-4">
            <p className="text-sm text-zinc-500">{label}</p>
            <p className="mt-1 text-2xl font-bold text-brand-700">{value}</p>
          </div>
        ))}
      </div>

      {editable && (
        <details className="card p-5">
          <summary className="cursor-pointer list-none font-semibold text-brand-800">+ Enregistrer une réunion</summary>
          <div className="mt-4">
            <MeetingForm
              action={saveMeeting.bind(null, project.id, null)}
              types={typeOptions}
              people={people}
              submitLabel="Enregistrer"
              resetOnSuccess
            />
          </div>
        </details>
      )}

      <section>
        <h2 className="mb-3 font-semibold text-brand-800">Réunions et comités</h2>
        {meetings.length === 0 ? (
          <div className="card"><EmptyState>Aucune réunion enregistrée.</EmptyState></div>
        ) : (
          <div className="space-y-4">
            {meetings.map((meeting) => (
              <article key={meeting.id} className="card relative p-5">
                <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-brand-800">{meeting.subject}</h3>
                    <p className="text-sm text-zinc-500">
                      {formatDateTime(meeting.date)}
                      {meeting.location && ` · ${meeting.location}`}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <RefBadge item={meeting.type} />
                      <span className="text-xs text-zinc-500">{meeting.participants.length} participant(s)</span>
                    </div>
                  </div>
                  {editable && (
                    <details>
                      <summary className="btn btn-secondary cursor-pointer list-none px-2 py-1 text-xs">Modifier</summary>
                      <div className="absolute right-4 z-10 mt-2 w-[min(46rem,85vw)] space-y-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
                        <MeetingForm
                          action={saveMeeting.bind(null, project.id, meeting.id)}
                          types={typeOptions}
                          people={people}
                          submitLabel="Enregistrer"
                          values={{
                            date: asInputDateTime(meeting.date),
                            typeId: meeting.typeId,
                            subject: meeting.subject,
                            location: meeting.location,
                            minutes: meeting.minutes,
                            participants: meeting.participants.map((p) => p.userId),
                          }}
                        />
                        <form action={deleteMeeting.bind(null, project.id, meeting.id)} className="border-t border-zinc-100 pt-3">
                          <SubmitButton className="btn btn-danger" pendingLabel="…" confirm={`Supprimer la réunion « ${meeting.subject} » ?`}>
                            Supprimer
                          </SubmitButton>
                        </form>
                      </div>
                    </details>
                  )}
                </header>

                {meeting.participants.length > 0 && (
                  <p className="mb-3 text-sm text-zinc-600">
                    Participants : {meeting.participants.map((p) => displayName(p.user)).join(", ")}
                  </p>
                )}
                {meeting.minutes && (
                  <div className="mb-3">
                    <h4 className="text-sm font-semibold text-zinc-700">Compte rendu</h4>
                    <p className="text-sm whitespace-pre-line text-zinc-700">{meeting.minutes}</p>
                  </div>
                )}
                {meeting.decisions.length > 0 && (
                  <p className="text-sm text-zinc-600">
                    Décisions : {meeting.decisions.map((d) => d.title).join(" · ")}
                  </p>
                )}
                {meeting.diligences.length > 0 && (
                  <p className="text-sm text-zinc-600">
                    Actions : {meeting.diligences.map((d) => `${d.title} (${d.status.label})`).join(" · ")}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {editable && (
        <details className="card p-5">
          <summary className="cursor-pointer list-none font-semibold text-brand-800">+ Enregistrer une décision</summary>
          <div className="mt-4">
            <ActionForm action={saveDecision.bind(null, project.id, null)} submitLabel="Enregistrer" resetOnSuccess>
              <DecisionFields people={people} meetings={meetingOptions} />
            </ActionForm>
          </div>
        </details>
      )}

      <section className="card overflow-x-auto">
        <h2 className="px-5 pt-5 pb-3 font-semibold text-brand-800">Registre des décisions</h2>
        {decisions.length === 0 ? (
          <EmptyState>Aucune décision enregistrée.</EmptyState>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Décision</th>
                <th>Date</th>
                <th>Décidée par</th>
                <th>Réunion</th>
                <th>Statut</th>
                {editable && <th />}
              </tr>
            </thead>
            <tbody>
              {decisions.map((decision) => (
                <tr key={decision.id}>
                  <td>
                    <span className="font-medium">{decision.title}</span>
                    {decision.description && <p className="text-xs text-zinc-500">{decision.description}</p>}
                  </td>
                  <td className="whitespace-nowrap">{formatDate(decision.decidedAt)}</td>
                  <td className="whitespace-nowrap">{decision.decidedBy ? displayName(decision.decidedBy) : "—"}</td>
                  <td>{decision.meeting?.subject ?? "—"}</td>
                  <td><Badge tone={DECISION_TONES[decision.status]}>{DECISION_LABELS[decision.status]}</Badge></td>
                  {editable && (
                    <td className="relative text-right">
                      <details className="inline-block">
                        <summary className="btn btn-secondary cursor-pointer list-none px-2 py-1 text-xs">Modifier</summary>
                        <div className="absolute right-0 z-10 mt-2 w-[min(40rem,85vw)] space-y-4 rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-lg">
                          <ActionForm action={saveDecision.bind(null, project.id, decision.id)}>
                            <DecisionFields values={decision} people={people} meetings={meetingOptions} />
                          </ActionForm>
                          <form action={deleteDecision.bind(null, project.id, decision.id)} className="border-t border-zinc-100 pt-3">
                            <SubmitButton className="btn btn-danger" pendingLabel="…" confirm={`Supprimer « ${decision.title} » ?`}>
                              Supprimer
                            </SubmitButton>
                          </form>
                        </div>
                      </details>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
