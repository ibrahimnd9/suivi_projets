import { db } from "@/lib/db";
import { getCurrentUser, displayName } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { visibleProjectsWhere } from "@/lib/projects";
import { csvResponse, decimal } from "@/lib/export";
import { WORK_ITEM_LABELS } from "@/lib/planning-labels";
import { RISK_STATUS_LABELS, kpiAchievement } from "@/lib/monitoring";

/** Exports Excel (CSV) filtrés selon les droits de l'utilisateur. */
export async function GET(_: Request, { params }: RouteContext<"/api/export/[jeu]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non autorisé", { status: 401 });
  const { jeu } = await params;

  const visible = visibleProjectsWhere(user);
  const projectIds = (await db.project.findMany({ where: visible, select: { id: true } })).map((p) => p.id);

  switch (jeu) {
    case "projets": {
      const projects = await db.project.findMany({
        where: visible,
        include: { status: true, type: true, priority: true, direction: true, pole: true, lead: true, owner: true, sponsor: true },
        orderBy: { code: "asc" },
      });
      return csvResponse(
        "projets",
        ["Code", "Nom", "Statut", "Type", "Priorité", "Direction", "Pôle", "Responsable", "Chef de projet", "Sponsor", "Début", "Fin prévue", "Fin réelle", "Avancement %", "Budget prévu", "Stratégique"],
        projects.map((p) => [
          p.code, p.name, p.status.label, p.type?.label, p.priority?.label, p.direction?.name, p.pole?.name,
          p.owner ? displayName(p.owner) : "", p.lead ? displayName(p.lead) : "", p.sponsor ? displayName(p.sponsor) : "",
          p.startDate, p.endDatePlanned, p.endDateActual, decimal(p.progress), decimal(p.budgetPlanned), p.strategic ? "Oui" : "Non",
        ]),
      );
    }

    case "planning": {
      const items = await db.workItem.findMany({
        where: { projectId: { in: projectIds } },
        include: { project: { select: { code: true } }, owner: true, status: true },
        orderBy: [{ projectId: "asc" }, { sortOrder: "asc" }],
      });
      return csvResponse(
        "planning",
        ["Projet", "Niveau", "Intitulé", "Responsable", "Statut", "Début", "Fin", "Avancement %", "Temps prévu (h)"],
        items.map((i) => [
          i.project.code, WORK_ITEM_LABELS[i.kind], i.name, i.owner ? displayName(i.owner) : "", i.status?.label,
          i.startDate, i.endDate, decimal(i.progress), decimal(i.plannedHours),
        ]),
      );
    }

    case "temps": {
      // Chacun exporte son temps ; les valideurs et la Direction exportent plus largement
      const where = can(user.profile, "projects.viewAll")
        ? {}
        : { OR: [{ userId: user.id }, { user: { managerId: user.id } }, { projectId: { in: projectIds } }] };
      const entries = await db.timeEntry.findMany({
        where,
        include: { user: true, project: { select: { code: true, name: true } }, workItem: true, activityType: true, timesheet: true },
        orderBy: [{ date: "desc" }],
      });
      return csvResponse(
        "temps",
        ["Date", "Intervenant", "Projet", "Activité du planning", "Type d’activité", "Heures", "Statut de la fiche", "Commentaire"],
        entries.map((e) => [
          e.date, displayName(e.user), e.project ? `${e.project.code} — ${e.project.name}` : "Hors projet",
          e.workItem?.name, e.activityType.label, decimal(e.hours), e.timesheet.status, e.comment,
        ]),
      );
    }

    case "kpi": {
      const kpis = await db.kpi.findMany({
        where: { projectId: { in: projectIds } },
        include: { project: { select: { code: true } }, type: true, owner: true, values: { orderBy: { period: "desc" } } },
      });
      return csvResponse(
        "indicateurs",
        ["Projet", "Indicateur", "Type", "Unité", "Fréquence", "Référence", "Cible", "Dernière valeur", "Période", "Taux de réalisation %", "Responsable"],
        kpis.map((k) => {
          const latest = k.values[0];
          const rate = kpiAchievement(k, latest?.value ?? null);
          return [
            k.project.code, k.name, k.type?.label, k.unit, k.frequency, decimal(k.baseline), decimal(k.target),
            decimal(latest?.value), latest?.period, rate === null ? "" : String(Math.round(rate)).replace(".", ","),
            k.owner ? displayName(k.owner) : "",
          ];
        }),
      );
    }

    case "risques": {
      const risks = await db.risk.findMany({
        where: { projectId: { in: projectIds } },
        include: { project: { select: { code: true } }, category: true, owner: true },
      });
      return csvResponse(
        "risques",
        ["Projet", "Nature", "Intitulé", "Catégorie", "Probabilité", "Impact", "Criticité", "Responsable", "Échéance", "Statut", "Plan de mitigation"],
        risks.map((r) => [
          r.project.code, r.kind, r.title, r.category?.label, r.probability, r.impact, r.probability * r.impact,
          r.owner ? displayName(r.owner) : "", r.dueDate, RISK_STATUS_LABELS[r.status], r.mitigationPlan,
        ]),
      );
    }

    case "diligences": {
      const diligences = await db.diligence.findMany({
        where: { projectId: { in: projectIds } },
        include: { project: { select: { code: true } }, owner: true, status: true, priority: true },
        orderBy: { dueDate: "asc" },
      });
      return csvResponse(
        "diligences",
        ["Projet", "Action", "Origine", "Responsable", "Émission", "Échéance", "Clôture", "Statut", "Priorité", "Commentaire"],
        diligences.map((d) => [
          d.project.code, d.title, d.origin, d.owner ? displayName(d.owner) : "", d.issuedAt, d.dueDate, d.closedAt,
          d.status.label, d.priority?.label, d.comment,
        ]),
      );
    }

    case "budget": {
      const lines = await db.budgetLine.findMany({
        where: { projectId: { in: projectIds } },
        include: { project: { select: { code: true } }, nature: true, workItem: true },
      });
      return csvResponse(
        "budget",
        ["Projet", "Ligne", "Nature", "Rattachement", "Période", "Initial", "Révisé", "Engagé", "Réalisé", "Commentaire"],
        lines.map((l) => [
          l.project.code, l.label, l.nature?.label, l.workItem?.name, l.period,
          decimal(l.initial), decimal(l.revised), decimal(l.committed), decimal(l.spent), l.comment,
        ]),
      );
    }

    default:
      return new Response("Jeu de données inconnu", { status: 404 });
  }
}
