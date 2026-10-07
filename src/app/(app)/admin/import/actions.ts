"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { generateTemporaryPassword, hashPassword } from "@/lib/auth/password";
import { nextProjectCode } from "@/lib/projects";
import { Profile } from "@/generated/prisma/enums";
import type { FormState } from "@/components/ui";

export type ImportReport = {
  created: number;
  updated: number;
  errors: { line: number; message: string }[];
  secrets?: { email: string; password: string }[];
};

/** Découpe un CSV à séparateur point-virgule ou virgule, en gérant les guillemets. */
function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const separator = (clean.split("\n")[0].match(/;/g)?.length ?? 0) >= (clean.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (quoted) {
      if (char === '"' && clean[i + 1] === '"') {
        value += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === separator) {
      row.push(value.trim());
      value = "";
    } else if (char === "\n") {
      row.push(value.trim());
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  row.push(value.trim());
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}

/** Associe les colonnes du fichier aux champs attendus, quel que soit leur ordre. */
function indexColumns(header: string[], mapping: Record<string, string[]>) {
  const normalized = header.map((h) =>
    h
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim(),
  );
  const columns: Record<string, number> = {};
  for (const [field, names] of Object.entries(mapping)) {
    const index = normalized.findIndex((h) => names.includes(h));
    if (index >= 0) columns[field] = index;
  }
  return columns;
}

async function readCsv(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Aucun fichier sélectionné." as const };
  if (file.size > 5 * 1024 * 1024) return { error: "Fichier trop volumineux (5 Mo maximum)." as const };
  const rows = parseCsv(await file.text());
  if (rows.length < 2) return { error: "Le fichier doit contenir un en-tête et au moins une ligne." as const };
  return { rows };
}

export async function importUsers(_: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("admin.users");
  const read = await readCsv(formData);
  if ("error" in read) return { error: read.error };
  const [header, ...lines] = read.rows;

  const columns = indexColumns(header, {
    email: ["email", "adresse email", "e-mail"],
    firstName: ["prenom", "prénom", "first name"],
    lastName: ["nom", "last name"],
    profile: ["profil", "role", "rôle"],
    jobTitle: ["fonction", "poste"],
    direction: ["direction"],
    pole: ["pole", "pôle"],
    manager: ["n+1", "responsable", "superieur", "supérieur", "manager"],
    capacity: ["capacite", "capacité", "heures", "capacite hebdomadaire"],
  });
  if (columns.email === undefined || columns.firstName === undefined || columns.lastName === undefined) {
    return { error: "Colonnes obligatoires manquantes : Email, Prénom, Nom." };
  }

  const [directions, poles] = await Promise.all([db.direction.findMany(), db.pole.findMany()]);
  const report: ImportReport = { created: 0, updated: 0, errors: [], secrets: [] };
  const cell = (row: string[], field: string) => (columns[field] !== undefined ? row[columns[field]]?.trim() || null : null);

  for (const [index, row] of lines.entries()) {
    const line = index + 2;
    const email = cell(row, "email")?.toLowerCase();
    const firstName = cell(row, "firstName");
    const lastName = cell(row, "lastName");
    if (!email || !firstName || !lastName) {
      report.errors.push({ line, message: "Email, prénom ou nom manquant." });
      continue;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      report.errors.push({ line, message: `Adresse email invalide : ${email}.` });
      continue;
    }

    const profileRaw = (cell(row, "profile") ?? "").toUpperCase();
    const profile = (Object.keys(Profile) as Profile[]).includes(profileRaw as Profile)
      ? (profileRaw as Profile)
      : "UTILISATEUR";
    const directionName = cell(row, "direction");
    const direction = directionName
      ? directions.find((d) => d.name.toLowerCase() === directionName.toLowerCase() || d.code.toLowerCase() === directionName.toLowerCase())
      : null;
    if (directionName && !direction) {
      report.errors.push({ line, message: `Direction inconnue : ${directionName}.` });
      continue;
    }
    const poleName = cell(row, "pole");
    const pole = poleName
      ? poles.find((p) => p.name.toLowerCase() === poleName.toLowerCase() || p.code.toLowerCase() === poleName.toLowerCase())
      : null;
    if (poleName && !pole) {
      report.errors.push({ line, message: `Pôle inconnu : ${poleName}.` });
      continue;
    }
    const managerEmail = cell(row, "manager")?.toLowerCase();
    const manager = managerEmail ? await db.user.findUnique({ where: { email: managerEmail } }) : null;
    if (managerEmail && !manager) {
      report.errors.push({ line, message: `Supérieur hiérarchique introuvable : ${managerEmail}.` });
      continue;
    }
    const capacityRaw = cell(row, "capacity");
    const capacity = capacityRaw ? Number(capacityRaw.replace(",", ".")) : 40;
    if (!Number.isFinite(capacity) || capacity < 0 || capacity > 80) {
      report.errors.push({ line, message: "Capacité hebdomadaire invalide." });
      continue;
    }

    const data = {
      firstName,
      lastName,
      profile,
      jobTitle: cell(row, "jobTitle"),
      directionId: direction?.id ?? null,
      poleId: pole?.id ?? null,
      managerId: manager?.id ?? null,
      weeklyCapacityHours: capacity,
    };

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      await db.user.update({ where: { email }, data });
      report.updated++;
    } else {
      const password = generateTemporaryPassword();
      await db.user.create({
        data: { ...data, email, passwordHash: await hashPassword(password), mustChangePassword: true },
      });
      report.created++;
      report.secrets!.push({ email, password });
    }
  }

  await audit({
    actor,
    action: "IMPORT",
    entity: "Utilisateur",
    entityLabel: "Import CSV",
    newValue: `${report.created} créé(s), ${report.updated} mis à jour, ${report.errors.length} erreur(s)`,
  });
  revalidatePath("/admin/utilisateurs");

  return {
    success: `${report.created} utilisateur(s) créé(s), ${report.updated} mis à jour, ${report.errors.length} ligne(s) en erreur.`,
    report: JSON.stringify(report),
  };
}

export async function importProjects(_: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("admin.users");
  const read = await readCsv(formData);
  if ("error" in read) return { error: read.error };
  const [header, ...lines] = read.rows;

  const columns = indexColumns(header, {
    code: ["code", "code projet"],
    name: ["nom", "nom du projet", "projet"],
    description: ["description"],
    status: ["statut"],
    type: ["type", "type de projet"],
    direction: ["direction"],
    lead: ["chef de projet", "chef"],
    owner: ["responsable"],
    startDate: ["debut", "début", "date de debut", "date de début"],
    endDate: ["fin", "fin prevue", "fin prévue", "date de fin"],
    budget: ["budget", "budget prevu", "budget prévu"],
  });
  if (columns.name === undefined) return { error: "Colonne obligatoire manquante : Nom du projet." };

  const [statuses, types, directions] = await Promise.all([
    db.refItem.findMany({ where: { kind: "PROJECT_STATUS" } }),
    db.refItem.findMany({ where: { kind: "PROJECT_TYPE" } }),
    db.direction.findMany(),
  ]);
  const defaultStatus = statuses.find((s) => s.isDefault) ?? statuses[0];
  if (!defaultStatus) return { error: "Aucun statut de projet n’est défini dans les référentiels." };

  const report: ImportReport = { created: 0, updated: 0, errors: [] };
  const cell = (row: string[], field: string) => (columns[field] !== undefined ? row[columns[field]]?.trim() || null : null);
  const parseDate = (value: string | null) => {
    if (!value) return null;
    const iso = /^\d{2}\/\d{2}\/\d{4}$/.test(value) ? value.split("/").reverse().join("-") : value;
    const date = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? undefined : date;
  };

  for (const [index, row] of lines.entries()) {
    const line = index + 2;
    const name = cell(row, "name");
    if (!name) {
      report.errors.push({ line, message: "Nom du projet manquant." });
      continue;
    }
    const startDate = parseDate(cell(row, "startDate"));
    const endDate = parseDate(cell(row, "endDate"));
    if (startDate === undefined || endDate === undefined) {
      report.errors.push({ line, message: "Date invalide (formats acceptés : AAAA-MM-JJ ou JJ/MM/AAAA)." });
      continue;
    }
    if (startDate && endDate && endDate < startDate) {
      report.errors.push({ line, message: "La date de fin précède la date de début." });
      continue;
    }

    const statusName = cell(row, "status");
    const status = statusName
      ? statuses.find((s) => s.label.toLowerCase() === statusName.toLowerCase() || s.code.toLowerCase() === statusName.toLowerCase())
      : defaultStatus;
    if (statusName && !status) {
      report.errors.push({ line, message: `Statut inconnu : ${statusName}.` });
      continue;
    }
    const typeName = cell(row, "type");
    const type = typeName
      ? types.find((t) => t.label.toLowerCase() === typeName.toLowerCase() || t.code.toLowerCase() === typeName.toLowerCase())
      : null;
    const directionName = cell(row, "direction");
    const direction = directionName
      ? directions.find((d) => d.name.toLowerCase() === directionName.toLowerCase() || d.code.toLowerCase() === directionName.toLowerCase())
      : null;
    const leadEmail = cell(row, "lead")?.toLowerCase();
    const lead = leadEmail ? await db.user.findUnique({ where: { email: leadEmail } }) : null;
    if (leadEmail && !lead) {
      report.errors.push({ line, message: `Chef de projet introuvable : ${leadEmail}.` });
      continue;
    }
    const ownerEmail = cell(row, "owner")?.toLowerCase();
    const owner = ownerEmail ? await db.user.findUnique({ where: { email: ownerEmail } }) : null;
    const budgetRaw = cell(row, "budget");
    const budget = budgetRaw ? Number(budgetRaw.replace(/\s/g, "").replace(",", ".")) : null;
    if (budgetRaw && (!Number.isFinite(budget) || budget! < 0)) {
      report.errors.push({ line, message: "Budget invalide." });
      continue;
    }

    const data = {
      name,
      description: cell(row, "description"),
      statusId: (status ?? defaultStatus).id,
      typeId: type?.id ?? null,
      directionId: direction?.id ?? null,
      leadId: lead?.id ?? null,
      ownerId: owner?.id ?? null,
      startDate: startDate ?? null,
      endDatePlanned: endDate ?? null,
      budgetPlanned: budget,
    };

    const code = cell(row, "code");
    const existing = code ? await db.project.findUnique({ where: { code } }) : null;
    if (existing) {
      await db.project.update({ where: { id: existing.id }, data });
      report.updated++;
    } else {
      const project = await db.project.create({
        data: { ...data, code: code ?? (await nextProjectCode()), createdById: actor.id },
      });
      if (lead) {
        await db.projectMember.create({ data: { projectId: project.id, userId: lead.id, role: "CHEF_DE_PROJET" } });
      }
      if (owner && owner.id !== lead?.id) {
        await db.projectMember.create({ data: { projectId: project.id, userId: owner.id, role: "RESPONSABLE" } });
      }
      report.created++;
    }
  }

  await audit({
    actor,
    action: "IMPORT",
    entity: "Projet",
    entityLabel: "Import CSV",
    newValue: `${report.created} créé(s), ${report.updated} mis à jour, ${report.errors.length} erreur(s)`,
  });
  revalidatePath("/portefeuille");

  return {
    success: `${report.created} projet(s) créé(s), ${report.updated} mis à jour, ${report.errors.length} ligne(s) en erreur.`,
    report: JSON.stringify(report),
  };
}
