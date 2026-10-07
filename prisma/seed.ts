import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { RefKind } from "../src/generated/prisma/enums";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

type Item = [code: string, label: string, color?: string, meta?: Record<string, number | boolean>];

// Valeurs initiales reprises du cahier des charges (modifiables ensuite dans l'administration)
const REFERENTIELS: Record<RefKind, Item[]> = {
  TASK_STATUS: [
    ["A_FAIRE", "À faire", "#9ca3af"],
    ["EN_COURS", "En cours", "#624da0"],
    ["EN_ATTENTE", "En attente", "#f59e0b"],
    ["BLOQUE", "Bloqué", "#ef4444"],
    ["TERMINE", "Terminé", "#10b981", { done: true }],
    ["ANNULE", "Annulé", "#a1a1aa", { done: true, canceled: true }],
  ],
  MEETING_TYPE: [
    ["COPIL", "Comité de pilotage"],
    ["COTECH", "Comité technique"],
    ["EQUIPE", "Réunion d’équipe"],
    ["ATELIER", "Atelier de travail"],
    ["REVUE", "Revue de projet"],
    ["AUTRE", "Autre"],
  ],
  DILIGENCE_STATUS: [
    ["NON_DEMARREE", "Non démarrée", "#9ca3af"],
    ["EN_COURS", "En cours", "#624da0"],
    ["EN_ATTENTE", "En attente", "#f59e0b"],
    ["REALISEE", "Réalisée", "#10b981", { done: true }],
    ["ANNULEE", "Annulée", "#a1a1aa", { done: true, canceled: true }],
  ],
  BUDGET_NATURE: [
    ["PERSONNEL", "Charges de personnel"],
    ["PRESTATION", "Prestations et services"],
    ["EQUIPEMENT", "Équipements"],
    ["MISSION", "Missions et déplacements"],
    ["FORMATION", "Formation"],
    ["FONCTIONNEMENT", "Fonctionnement"],
  ],
  PROJECT_STATUS: [
    ["BROUILLON", "Brouillon", "#9ca3af"],
    ["PREPARATION", "En préparation", "#8b7bc6"],
    ["ATTENTE_VALIDATION", "En attente de validation", "#f59e0b"],
    ["VALIDE", "Validé", "#3b82f6"],
    ["EN_COURS", "En cours", "#624da0"],
    ["EN_PAUSE", "En pause", "#a1a1aa"],
    ["TERMINE", "Terminé", "#10b981", { closed: false, finished: true }],
    ["CLOTURE", "Clôturé", "#047857", { closed: true }],
    ["ABANDONNE", "Abandonné", "#ef4444", { closed: true }],
  ],
  PROJECT_TYPE: [
    ["INTERNE", "Projet interne"],
    ["PARTENARIAT", "Projet de partenariat"],
    ["CONVENTION", "Projet sous convention"],
    ["TRANSFORMATION", "Projet de transformation"],
  ],
  PROJECT_CATEGORY: [
    ["DIGITAL", "Digital & systèmes d’information"],
    ["INFRA", "Infrastructures"],
    ["ORGANISATION", "Organisation & processus"],
    ["RH", "Ressources humaines & formation"],
  ],
  PRIORITY: [
    ["BASSE", "Basse", "#9ca3af", { weight: 1 }],
    ["MOYENNE", "Moyenne", "#3b82f6", { weight: 2 }],
    ["HAUTE", "Haute", "#f59e0b", { weight: 3 }],
    ["CRITIQUE", "Critique", "#ef4444", { weight: 4 }],
  ],
  STRATEGIC_AXIS: [],
  FUNDING_SOURCE: [
    ["FONDS_PROPRES", "Fonds propres"],
    ["PARTENAIRE", "Financement partenaire"],
    ["SUBVENTION", "Subvention"],
  ],
  ACTIVITY_TYPE: [
    ["REUNION", "Réunion"],
    ["PLANIFICATION", "Planification"],
    ["PRODUCTION", "Production"],
    ["ANALYSE", "Analyse"],
    ["DEVELOPPEMENT", "Développement"],
    ["DEPLACEMENT", "Déplacement"],
    ["FORMATION", "Formation"],
    ["COORDINATION", "Coordination"],
    ["REPORTING", "Reporting"],
    ["ASSISTANCE", "Assistance"],
    ["AUTRE", "Autre"],
  ],
  RISK_CATEGORY: [
    ["STRATEGIQUE", "Stratégique"],
    ["OPERATIONNEL", "Opérationnel"],
    ["FINANCIER", "Financier"],
    ["TECHNIQUE", "Technique"],
    ["JURIDIQUE", "Juridique & conformité"],
    ["RH", "Ressources humaines"],
  ],
  KPI_TYPE: [
    ["NOMBRE", "Nombre"],
    ["POURCENTAGE", "Pourcentage"],
    ["MONTANT", "Montant"],
    ["DELAI", "Délai"],
    ["RATIO", "Ratio"],
    ["QUALITATIF", "Indicateur qualitatif"],
  ],
  DOCUMENT_CATEGORY: [
    ["CONVENTION", "Convention"],
    ["NOTE_CADRAGE", "Note de cadrage"],
    ["TDR", "TDR"],
    ["PLANNING", "Planning"],
    ["COMPTE_RENDU", "Comptes rendus"],
    ["RAPPORT", "Rapports"],
    ["LIVRABLE", "Livrables"],
    ["CORRESPONDANCE", "Correspondances"],
    ["FINANCIER", "Documents financiers"],
    ["TECHNIQUE", "Documents techniques"],
    ["AUTRE", "Autres"],
  ],
};

const DEFAULTS: Partial<Record<RefKind, string>> = {
  TASK_STATUS: "A_FAIRE",
  DILIGENCE_STATUS: "NON_DEMARREE",
  PROJECT_STATUS: "BROUILLON",
  PRIORITY: "MOYENNE",
  ACTIVITY_TYPE: "PRODUCTION",
};

async function main() {
  // Référentiels : création uniquement des valeurs absentes (les modifications de l'admin sont conservées)
  for (const [kind, items] of Object.entries(REFERENTIELS) as [RefKind, Item[]][]) {
    for (const [index, [code, label, color, meta]] of items.entries()) {
      await db.refItem.upsert({
        where: { kind_code: { kind, code } },
        update: {},
        create: {
          kind,
          code,
          label,
          color: color ?? null,
          meta: meta ?? undefined,
          sortOrder: (index + 1) * 10,
          isDefault: DEFAULTS[kind] === code,
        },
      });
    }
  }

  // Organisation minimale
  const dg = await db.direction.upsert({
    where: { code: "DG" },
    update: {},
    create: { code: "DG", name: "Direction Générale" },
  });
  await db.pole.upsert({
    where: { code: "PSE" },
    update: {},
    create: { code: "PSE", name: "Pôle Suivi-Évaluation", directionId: dg.id },
  });

  // Administrateur initial
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@synap-suivi.local").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) throw new Error("SEED_ADMIN_PASSWORD doit être défini.");
  const existing = await db.user.findUnique({ where: { email } });
  if (!existing) {
    await db.user.create({
      data: {
        email,
        firstName: "Administrateur",
        lastName: "SYNAP-SUIVI",
        profile: "ADMIN",
        passwordHash: await bcrypt.hash(password, 12),
        mustChangePassword: true,
        directionId: dg.id,
      },
    });
    console.log(`Compte administrateur créé : ${email}`);
  } else {
    console.log(`Compte administrateur déjà présent : ${email}`);
  }
  console.log("Initialisation terminée.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
