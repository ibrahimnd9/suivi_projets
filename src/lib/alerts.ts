import "server-only";
import { db } from "@/lib/db";
import { isLate, milestoneState, workItemInclude } from "@/lib/planning";
import { isDiligenceLate, isRiskOpen, riskLevel, budgetTotals } from "@/lib/monitoring";
import { weekStartOf, weekKey } from "@/lib/timesheet-utils";
import { getAlertSettings, getLastAlertScan, setLastAlertScan } from "@/lib/settings";
import type { NotificationLevel } from "@/generated/prisma/enums";

type Draft = {
  userIds: string[];
  level: NotificationLevel;
  category: string;
  title: string;
  body?: string;
  link?: string;
  dedupeKey: string;
};

const day = 86_400_000;
const dayKey = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Analyse l'ensemble des projets et crée les notifications manquantes.
 * Les alertes sont dédupliquées : une même situation ne génère qu'une notification par personne.
 */
export async function runAlertScan(now = new Date()) {
  const settings = await getAlertSettings();
  const soon = new Date(now.getTime() + settings.dueSoonDays * day);
  const drafts: Draft[] = [];

  const projects = await db.project.findMany({
    include: {
      status: true,
      members: true,
      workItems: { include: { ...workItemInclude, children: { select: { id: true } } } },
      milestones: true,
      diligences: { include: { status: true } },
      risks: true,
      budgetLines: true,
    },
  });

  for (const project of projects) {
    const closed = (project.status.meta as { closed?: boolean } | null)?.closed === true;
    if (closed) continue;

    const managers = [project.leadId, project.ownerId].filter((id): id is string => !!id);
    const team = [...new Set([...managers, ...project.members.map((m) => m.userId)])];
    const link = `/projets/${project.id}`;

    // Tâches en retard ou arrivant à échéance
    for (const item of project.workItems) {
      if (item.children?.length) continue;
      const recipients = [...new Set([item.ownerId, ...item.assignees.map((a) => a.userId), ...managers].filter((id): id is string => !!id))];
      if (recipients.length === 0) continue;
      if (isLate(item, now)) {
        drafts.push({
          userIds: recipients,
          level: "ALERTE",
          category: "TACHE_RETARD",
          title: `Tâche en retard : ${item.name}`,
          body: `${project.code} — échéance dépassée le ${dayKey(item.endDate!)}.`,
          link: `${link}/planification`,
          dedupeKey: `tache-retard:${item.id}:${dayKey(item.endDate!)}`,
        });
      } else if (item.endDate && item.endDate <= soon) {
        drafts.push({
          userIds: recipients,
          level: "INFO",
          category: "TACHE_ECHEANCE",
          title: `Tâche à échéance proche : ${item.name}`,
          body: `${project.code} — à terminer avant le ${dayKey(item.endDate)}.`,
          link: `${link}/planification`,
          dedupeKey: `tache-echeance:${item.id}:${dayKey(item.endDate)}`,
        });
      }
    }

    // Jalons
    for (const milestone of project.milestones) {
      const state = milestoneState(milestone, now);
      const recipients = [...new Set([milestone.ownerId, ...managers].filter((id): id is string => !!id))];
      if (recipients.length === 0) continue;
      if (state.tone === "red") {
        drafts.push({
          userIds: recipients,
          level: "CRITIQUE",
          category: "JALON_DEPASSE",
          title: `Jalon dépassé : ${milestone.name}`,
          body: `${project.code} — prévu le ${dayKey(milestone.dueDate)}.`,
          link: `${link}/jalons`,
          dedupeKey: `jalon-depasse:${milestone.id}:${dayKey(milestone.dueDate)}`,
        });
      } else if (state.tone === "amber" && milestone.status === "PREVU") {
        drafts.push({
          userIds: recipients,
          level: "ALERTE",
          category: "JALON_PROCHE",
          title: `Jalon imminent : ${milestone.name}`,
          body: `${project.code} — prévu le ${dayKey(milestone.dueDate)}.`,
          link: `${link}/jalons`,
          dedupeKey: `jalon-proche:${milestone.id}:${dayKey(milestone.dueDate)}`,
        });
      }
    }

    // Diligences en retard
    for (const diligence of project.diligences) {
      if (!isDiligenceLate(diligence, now)) continue;
      const recipients = [...new Set([diligence.ownerId, ...managers].filter((id): id is string => !!id))];
      if (recipients.length === 0) continue;
      drafts.push({
        userIds: recipients,
        level: "ALERTE",
        category: "DILIGENCE_RETARD",
        title: `Diligence en retard : ${diligence.title}`,
        body: `${project.code} — échéance du ${dayKey(diligence.dueDate!)}.`,
        link: `${link}/diligences`,
        dedupeKey: `diligence-retard:${diligence.id}:${dayKey(diligence.dueDate!)}`,
      });
    }

    // Risques critiques ouverts
    for (const risk of project.risks) {
      if (!isRiskOpen(risk.status)) continue;
      if (riskLevel(risk.probability, risk.impact).label !== "Critique") continue;
      const recipients = [...new Set([risk.ownerId, ...managers].filter((id): id is string => !!id))];
      if (recipients.length === 0) continue;
      drafts.push({
        userIds: recipients,
        level: "CRITIQUE",
        category: "RISQUE_CRITIQUE",
        title: `Risque critique : ${risk.title}`,
        body: `${project.code} — criticité ${risk.probability * risk.impact}.`,
        link: `${link}/risques`,
        dedupeKey: `risque-critique:${risk.id}:${risk.probability}x${risk.impact}`,
      });
    }

    // Budget au-delà du seuil
    const budget = budgetTotals(project.budgetLines);
    if (project.budgetLines.length > 0 && budget.consumptionRate >= settings.budgetThreshold && managers.length > 0) {
      drafts.push({
        userIds: managers,
        level: "ALERTE",
        category: "BUDGET_SEUIL",
        title: `Budget consommé à ${Math.round(budget.consumptionRate)} %`,
        body: `${project.code} — seuil d’alerte fixé à ${settings.budgetThreshold} %.`,
        link: `${link}/budget`,
        dedupeKey: `budget-seuil:${project.id}:${Math.floor(budget.consumptionRate / 5) * 5}`,
      });
    }

    // Projet proche de sa date de fin
    if (project.endDatePlanned && !project.endDateActual && project.endDatePlanned <= soon && team.length > 0) {
      drafts.push({
        userIds: managers.length ? managers : team,
        level: project.endDatePlanned < now ? "CRITIQUE" : "ALERTE",
        category: "PROJET_ECHEANCE",
        title:
          project.endDatePlanned < now
            ? `Projet en retard : ${project.name}`
            : `Fin de projet proche : ${project.name}`,
        body: `${project.code} — fin prévue le ${dayKey(project.endDatePlanned)}.`,
        link,
        dedupeKey: `projet-echeance:${project.id}:${dayKey(project.endDatePlanned)}`,
      });
    }
  }

  // Fiches de temps de la semaine écoulée non soumises
  const lastWeek = weekStartOf(new Date(now.getTime() - 7 * day));
  const users = await db.user.findMany({ where: { active: true }, select: { id: true, managerId: true } });
  const sheets = await db.timesheet.findMany({ where: { weekStart: lastWeek } });
  for (const user of users) {
    const sheet = sheets.find((s) => s.userId === user.id);
    if (!sheet || sheet.status === "BROUILLON" || sheet.status === "REJETE") {
      drafts.push({
        userIds: [user.id],
        level: "ALERTE",
        category: "TEMPS_NON_SOUMIS",
        title: "Fiche de temps non soumise",
        body: `La semaine du ${weekKey(lastWeek)} n’a pas encore été soumise.`,
        link: `/temps?semaine=${weekKey(lastWeek)}`,
        dedupeKey: `temps-non-soumis:${user.id}:${weekKey(lastWeek)}`,
      });
    }
  }

  // Fiches en attente de validation
  const pending = await db.timesheet.findMany({
    where: { status: "SOUMIS" },
    include: { user: { select: { managerId: true, firstName: true, lastName: true } } },
  });
  for (const sheet of pending) {
    if (!sheet.user.managerId) continue;
    drafts.push({
      userIds: [sheet.user.managerId],
      level: "INFO",
      category: "TEMPS_A_VALIDER",
      title: `Fiche de temps à valider : ${sheet.user.firstName} ${sheet.user.lastName}`,
      body: `Semaine du ${weekKey(sheet.weekStart)}.`,
      link: "/temps/validation",
      dedupeKey: `temps-a-valider:${sheet.id}`,
    });
  }

  let created = 0;
  for (const draft of drafts) {
    for (const userId of draft.userIds) {
      const result = await db.notification.createMany({
        data: [
          {
            userId,
            level: draft.level,
            category: draft.category,
            title: draft.title,
            body: draft.body ?? null,
            link: draft.link ?? null,
            dedupeKey: draft.dedupeKey,
          },
        ],
        skipDuplicates: true,
      });
      created += result.count;
    }
  }

  await setLastAlertScan(now);
  return { created, scanned: projects.length };
}

/** Relance l'analyse si la dernière date de plus de 30 minutes. */
export async function maybeRunAlertScan(now = new Date()) {
  const last = await getLastAlertScan();
  if (last && now.getTime() - last.getTime() < 30 * 60_000) return null;
  return runAlertScan(now);
}

export const NOTIFICATION_TONES: Record<NotificationLevel, "zinc" | "amber" | "red"> = {
  INFO: "zinc",
  ALERTE: "amber",
  CRITIQUE: "red",
};
