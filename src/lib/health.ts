import "server-only";
import { db } from "@/lib/db";
import { buildTree, flattenTree, isLate, milestoneState, workItemInclude } from "@/lib/planning";
import { budgetTotals, isDiligenceLate, isRiskOpen, kpiAchievement, kpiState, riskLevel } from "@/lib/monitoring";
import { projectWorkload } from "@/lib/timesheets";
import { DEFAULT_WEIGHTS, type AlertSettings, type HealthWeights } from "@/lib/settings";

export type HealthComponent = { key: keyof HealthWeights; label: string; score: number | null; weight: number; detail: string };

export type ProjectHealth = {
  score: number;
  color: "VERT" | "ORANGE" | "ROUGE";
  components: HealthComponent[];
  stats: {
    progress: number;
    lateItems: number;
    lateMilestones: number;
    openDiligences: number;
    lateDiligences: number;
    openRisks: number;
    criticalRisks: number;
    kpiTotal: number;
    kpiOk: number;
    kpiOff: number;
    budgetRate: number;
    budgetPlanned: number;
    budgetSpent: number;
    hoursPlanned: number;
    hoursConsumed: number;
  };
};

const clamp = (value: number) => Math.max(0, Math.min(100, value));

/**
 * Score de santé d'un projet, de 0 à 100, pondéré selon les paramètres.
 * Les composantes sans donnée sont ignorées et leur poids est réparti sur les autres.
 */
export async function projectHealth(
  projectId: string,
  weights: HealthWeights = DEFAULT_WEIGHTS,
  thresholds: Pick<AlertSettings, "redBelow" | "greenFrom">,
  now = new Date(),
): Promise<ProjectHealth> {
  const [project, items, milestones, diligences, risks, kpis, budgetLines, workload] = await Promise.all([
    db.project.findUniqueOrThrow({ where: { id: projectId } }),
    db.workItem.findMany({ where: { projectId }, include: workItemInclude }),
    db.milestone.findMany({ where: { projectId } }),
    db.diligence.findMany({ where: { projectId }, include: { status: true } }),
    db.risk.findMany({ where: { projectId } }),
    db.kpi.findMany({ where: { projectId }, include: { values: { orderBy: { period: "desc" }, take: 1 } } }),
    db.budgetLine.findMany({ where: { projectId } }),
    projectWorkload(projectId),
  ]);

  const rows = flattenTree(buildTree(items));
  const tasks = rows.filter((r) => r.children.length === 0);
  const lateItems = tasks.filter((t) => isLate(t, now)).length;
  const lateMilestones = milestones.filter((m) => milestoneState(m, now).tone === "red").length;
  const doneDiligences = diligences.filter((d) => (d.status.meta as { done?: boolean } | null)?.done === true);
  const lateDiligences = diligences.filter((d) => isDiligenceLate(d, now));
  const openRisks = risks.filter((r) => isRiskOpen(r.status));
  const criticalRisks = openRisks.filter((r) => riskLevel(r.probability, r.impact).label === "Critique");
  const kpiStates = kpis.map((k) => kpiState(kpiAchievement(k, k.values[0]?.value ?? null), k));
  const kpiMeasured = kpiStates.filter((s) => s.tone !== "zinc");
  const budget = budgetTotals(budgetLines);
  const progress = Number(project.progress);

  // Planning : part des tâches et jalons dans les temps
  const trackedItems = tasks.length + milestones.length;
  const planningScore = trackedItems === 0 ? null : clamp(100 - ((lateItems + lateMilestones) / trackedItems) * 100);

  // Budget : pénalise une consommation supérieure à l'avancement
  const budgetReference = budget.revised || budget.initial || Number(project.budgetPlanned ?? 0);
  const budgetScore =
    budgetReference === 0 || budget.spent === 0
      ? null
      : clamp(100 - Math.max(0, budget.consumptionRate - Math.max(progress, 10)) * 2);

  // Avancement : comparé au temps écoulé du projet
  let progressScore: number | null = progress;
  if (project.startDate && project.endDatePlanned) {
    const total = project.endDatePlanned.getTime() - project.startDate.getTime();
    const elapsed = now.getTime() - project.startDate.getTime();
    const expected = total > 0 ? clamp((elapsed / total) * 100) : 0;
    progressScore = expected <= 0 ? 100 : clamp(100 - Math.max(0, expected - progress) * 1.5);
  }

  // Risques : pénalité selon la criticité des risques ouverts
  const riskPenalty = openRisks.reduce((sum, r) => {
    const level = riskLevel(r.probability, r.impact);
    return sum + (level.label === "Critique" ? 25 : level.label === "Moyen" ? 10 : 3);
  }, 0);
  const riskScore = risks.length === 0 ? null : clamp(100 - riskPenalty);

  // KPI : part des indicateurs atteints parmi ceux qui sont renseignés
  const kpiScore =
    kpiMeasured.length === 0
      ? null
      : clamp(
          (kpiMeasured.filter((s) => s.tone === "green").length * 100 +
            kpiMeasured.filter((s) => s.tone === "amber").length * 60) /
            kpiMeasured.length,
        );

  // Ressources : écart entre consommation du temps et avancement
  const resourceScore =
    workload.planned === 0 || workload.consumed === 0
      ? null
      : clamp(100 - Math.max(0, (workload.consumed / workload.planned) * 100 - Math.max(progress, 10)) * 2);

  const components: HealthComponent[] = [
    { key: "planning", label: "Planning", score: planningScore, weight: weights.planning, detail: `${lateItems} tâche(s) et ${lateMilestones} jalon(s) en retard` },
    { key: "budget", label: "Budget", score: budgetScore, weight: weights.budget, detail: `${Math.round(budget.consumptionRate)} % consommé` },
    { key: "progress", label: "Avancement", score: progressScore, weight: weights.progress, detail: `${Math.round(progress)} % réalisé` },
    { key: "risks", label: "Risques", score: riskScore, weight: weights.risks, detail: `${criticalRisks.length} risque(s) critique(s) ouvert(s)` },
    { key: "kpi", label: "Indicateurs", score: kpiScore, weight: weights.kpi, detail: `${kpiMeasured.filter((s) => s.tone === "green").length}/${kpiMeasured.length} atteint(s)` },
    { key: "resources", label: "Ressources", score: resourceScore, weight: weights.resources, detail: `${Math.round(workload.consumed)} h consommées` },
  ];

  const usable = components.filter((c) => c.score !== null);
  const totalWeight = usable.reduce((sum, c) => sum + c.weight, 0);
  const score = totalWeight === 0 ? 100 : usable.reduce((sum, c) => sum + c.score! * c.weight, 0) / totalWeight;

  return {
    score,
    color: score >= thresholds.greenFrom ? "VERT" : score >= thresholds.redBelow ? "ORANGE" : "ROUGE",
    components,
    stats: {
      progress,
      lateItems,
      lateMilestones,
      openDiligences: diligences.length - doneDiligences.length,
      lateDiligences: lateDiligences.length,
      openRisks: openRisks.length,
      criticalRisks: criticalRisks.length,
      kpiTotal: kpis.length,
      kpiOk: kpiStates.filter((s) => s.tone === "green").length,
      kpiOff: kpiStates.filter((s) => s.tone === "red").length,
      budgetRate: budget.consumptionRate,
      budgetPlanned: budgetReference,
      budgetSpent: budget.spent,
      hoursPlanned: workload.planned,
      hoursConsumed: workload.consumed,
    },
  };
}

export const HEALTH_TONES = { VERT: "green", ORANGE: "amber", ROUGE: "red" } as const;
