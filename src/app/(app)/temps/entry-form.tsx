"use client";

import { useState } from "react";
import { FormMessage, type FormState } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { useFormAction } from "@/components/use-form-action";

type Project = { id: string; label: string };
type WorkItem = { id: string; label: string; projectId: string };
type Activity = { id: string; label: string };

export type EntryValues = {
  date: string;
  projectId: string | null;
  workItemId: string | null;
  activityTypeId: string;
  hours: string;
  comment: string | null;
};

export function TimeEntryForm({
  action,
  projects,
  workItems,
  activities,
  days,
  values,
  submitLabel,
  resetOnSuccess = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  projects: Project[];
  workItems: WorkItem[];
  activities: Activity[];
  days: { value: string; label: string }[];
  values?: EntryValues;
  submitLabel: string;
  resetOnSuccess?: boolean;
}) {
  const { state, action: formAction, onSubmit, pending } = useFormAction(action);
  const [projectId, setProjectId] = useState(values?.projectId ?? "");
  const items = workItems.filter((item) => item.projectId === projectId);
  const key = resetOnSuccess ? (state?.nonce ?? 0) : "form";

  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-3" key={key}>
      <div className="grid gap-3 lg:grid-cols-[10rem_1fr_1fr_10rem_7rem]">
        <div>
          <label className="label">Jour *</label>
          <select name="date" defaultValue={values?.date ?? days[0]?.value} className="input">
            {days.map((day) => (
              <option key={day.value} value={day.value}>{day.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Projet</label>
          <select
            name="projectId"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="input"
          >
            <option value="">Hors projet</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Activité du planning</label>
          <select name="workItemId" defaultValue={values?.workItemId ?? ""} key={projectId} className="input" disabled={!projectId}>
            <option value="">—</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Type d’activité *</label>
          <select name="activityTypeId" defaultValue={values?.activityTypeId} className="input">
            {activities.map((activity) => (
              <option key={activity.id} value={activity.id}>{activity.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Heures *</label>
          <input
            name="hours"
            type="number"
            step="0.25"
            min="0.25"
            max="24"
            defaultValue={values?.hours ?? "1"}
            required
            className="input"
          />
        </div>
      </div>
      <div>
        <label className="label">Commentaire</label>
        <input name="comment" defaultValue={values?.comment ?? ""} className="input" placeholder="Réunion COPIL, analyse des données…" />
      </div>
      <FormMessage state={state} />
      <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
    </form>
  );
}
