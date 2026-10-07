import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { WorkItemKind } from "@/generated/prisma/enums";

export { WORK_ITEM_LABELS, DEPENDENCY_LABELS } from "@/lib/planning-labels";

/** Niveaux autorisés sous un élément donné (la hiérarchie peut sauter des niveaux). */
export function allowedChildKinds(parent: WorkItemKind | null): WorkItemKind[] {
  switch (parent) {
    case null:
      return ["PHASE", "ACTIVITE", "TACHE"];
    case "PHASE":
      return ["ACTIVITE", "TACHE"];
    case "ACTIVITE":
      return ["SOUS_ACTIVITE", "TACHE"];
    case "SOUS_ACTIVITE":
      return ["TACHE"];
    default:
      return [];
  }
}

export const workItemInclude = {
  owner: true,
  status: true,
  priority: true,
  assignees: { include: { user: true } },
  dependencies: { include: { dependsOn: true } },
} satisfies Prisma.WorkItemInclude;

export type WorkItemRow = Prisma.WorkItemGetPayload<{ include: typeof workItemInclude }>;
export type WorkItemNode = WorkItemRow & { children: WorkItemNode[]; depth: number };

/** Construit l'arborescence à partir de la liste à plat. */
export function buildTree(items: WorkItemRow[]): WorkItemNode[] {
  const nodes = new Map<string, WorkItemNode>();
  for (const item of items) nodes.set(item.id, { ...item, children: [], depth: 0 });
  const roots: WorkItemNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) {
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sort = (list: WorkItemNode[]) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    for (const node of list) {
      node.depth = node.parentId ? (nodes.get(node.parentId)?.depth ?? 0) + 1 : 0;
      sort(node.children);
    }
  };
  sort(roots);
  return roots;
}

/** Parcours en profondeur, dans l'ordre d'affichage. */
export function flattenTree(nodes: WorkItemNode[]): WorkItemNode[] {
  return nodes.flatMap((node) => [node, ...flattenTree(node.children)]);
}

const isDone = (item: { status: { meta: unknown } | null; progress: unknown }) => {
  const meta = item.status?.meta as { done?: boolean } | null | undefined;
  return meta?.done === true || Number(item.progress) >= 100;
};

export function isLate(item: { endDate: Date | null; status: { meta: unknown } | null; progress: unknown }, now = new Date()) {
  return !!item.endDate && item.endDate < now && !isDone(item);
}

/**
 * Avancement d'un élément : moyenne des tâches sous-jacentes, pondérée par leur durée prévue
 * (à défaut, moyenne simple). Une tâche sans enfant garde son avancement saisi.
 */
export function computeProgress(node: WorkItemNode): number {
  if (node.children.length === 0) return Number(node.progress);
  const weights = node.children.map((child) => {
    const duration =
      child.startDate && child.endDate
        ? Math.max(1, (child.endDate.getTime() - child.startDate.getTime()) / 86_400_000)
        : 1;
    return { progress: computeProgress(child), weight: duration };
  });
  const total = weights.reduce((sum, w) => sum + w.weight, 0);
  if (!total) return 0;
  return weights.reduce((sum, w) => sum + w.progress * w.weight, 0) / total;
}

/** Dates d'un élément : les siennes, ou l'enveloppe de ses enfants. */
export function effectiveDates(node: WorkItemNode): { start: Date | null; end: Date | null } {
  if (node.children.length === 0) return { start: node.startDate, end: node.endDate };
  const childDates = node.children.map(effectiveDates);
  const starts = [node.startDate, ...childDates.map((d) => d.start)].filter((d): d is Date => !!d);
  const ends = [node.endDate, ...childDates.map((d) => d.end)].filter((d): d is Date => !!d);
  return {
    start: starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null,
    end: ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null,
  };
}

/** Recalcule et enregistre l'avancement du projet à partir de son planning. */
export async function recomputeProjectProgress(projectId: string) {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { progressAuto: true } });
  if (!project?.progressAuto) return;
  const items = await db.workItem.findMany({ where: { projectId }, include: workItemInclude });
  if (items.length === 0) return;
  const roots = buildTree(items);
  const virtual: WorkItemNode = {
    ...roots[0],
    children: roots,
    startDate: null,
    endDate: null,
    progress: 0 as unknown as WorkItemRow["progress"],
  };
  const progress = Math.round(computeProgress(virtual) * 100) / 100;
  await db.project.update({ where: { id: projectId }, data: { progress } });
}

/** Vérifie qu'ajouter un lien ne crée pas de boucle (A → B → … → A). */
export async function wouldCreateCycle(itemId: string, dependsOnId: string) {
  if (itemId === dependsOnId) return true;
  const links = await db.workItemDependency.findMany({ select: { itemId: true, dependsOnId: true } });
  const predecessors = new Map<string, string[]>();
  for (const link of links) {
    predecessors.set(link.itemId, [...(predecessors.get(link.itemId) ?? []), link.dependsOnId]);
  }
  const stack = [dependsOnId];
  const seen = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (current === itemId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(predecessors.get(current) ?? []));
  }
  return false;
}

export type DependencyViolation = { item: string; dependsOn: string; message: string };

/** Liens dont les dates ne sont pas respectées. */
export function dependencyViolations(items: WorkItemRow[]): DependencyViolation[] {
  const violations: DependencyViolation[] = [];
  for (const item of items) {
    for (const link of item.dependencies) {
      const before = link.dependsOn;
      const lag = link.lagDays * 86_400_000;
      if (link.kind === "FIN_DEBUT" && before.endDate && item.startDate) {
        if (item.startDate.getTime() < before.endDate.getTime() + lag) {
          violations.push({
            item: item.name,
            dependsOn: before.name,
            message: `« ${item.name} » devrait démarrer après la fin de « ${before.name} ».`,
          });
        }
      }
      if (link.kind === "DEBUT_DEBUT" && before.startDate && item.startDate) {
        if (item.startDate.getTime() < before.startDate.getTime() + lag) {
          violations.push({
            item: item.name,
            dependsOn: before.name,
            message: `« ${item.name} » devrait démarrer après le début de « ${before.name} ».`,
          });
        }
      }
      if (link.kind === "FIN_FIN" && before.endDate && item.endDate) {
        if (item.endDate.getTime() < before.endDate.getTime() + lag) {
          violations.push({
            item: item.name,
            dependsOn: before.name,
            message: `« ${item.name} » devrait se terminer après « ${before.name} ».`,
          });
        }
      }
    }
  }
  return violations;
}

/**
 * Replanifie les éléments dépendants pour respecter les liens, en conservant leur durée.
 * Retourne le nombre d'éléments décalés.
 */
export async function rescheduleDependents(projectId: string) {
  const items = await db.workItem.findMany({ where: { projectId }, include: workItemInclude });
  const byId = new Map(items.map((i) => [i.id, i]));
  const moves = new Map<string, { startDate: Date; endDate: Date }>();

  // Plusieurs passes : un décalage peut en entraîner d'autres
  for (let pass = 0; pass < 10; pass++) {
    let changed = false;
    for (const item of items) {
      const current = moves.get(item.id);
      const start = current?.startDate ?? item.startDate;
      const end = current?.endDate ?? item.endDate;
      if (!start || !end) continue;

      let earliest = start;
      for (const link of item.dependencies) {
        const before = byId.get(link.dependsOnId);
        if (!before) continue;
        const beforeMoved = moves.get(before.id);
        const beforeStart = beforeMoved?.startDate ?? before.startDate;
        const beforeEnd = beforeMoved?.endDate ?? before.endDate;
        const lag = link.lagDays * 86_400_000;
        const constraint =
          link.kind === "FIN_DEBUT" && beforeEnd
            ? new Date(beforeEnd.getTime() + 86_400_000 + lag)
            : link.kind === "DEBUT_DEBUT" && beforeStart
              ? new Date(beforeStart.getTime() + lag)
              : null;
        if (constraint && constraint > earliest) earliest = constraint;
      }

      if (earliest.getTime() !== start.getTime()) {
        const duration = end.getTime() - start.getTime();
        moves.set(item.id, { startDate: earliest, endDate: new Date(earliest.getTime() + duration) });
        changed = true;
      }
    }
    if (!changed) break;
  }

  for (const [id, dates] of moves) {
    await db.workItem.update({ where: { id }, data: dates });
  }
  return moves.size;
}

export function milestoneState(milestone: { dueDate: Date; actualDate: Date | null; status: string }, now = new Date()) {
  if (milestone.status === "ANNULE") return { label: "Annulé", tone: "zinc" as const };
  if (milestone.status === "ATTEINT" || milestone.actualDate) {
    const late = milestone.actualDate && milestone.actualDate > milestone.dueDate;
    return { label: late ? "Atteint en retard" : "Atteint", tone: late ? ("amber" as const) : ("green" as const) };
  }
  const days = Math.ceil((milestone.dueDate.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return { label: `Dépassé de ${Math.abs(days)} j`, tone: "red" as const };
  if (days <= 7) return { label: `Dans ${days} j`, tone: "amber" as const };
  return { label: "À venir", tone: "brand" as const };
}
