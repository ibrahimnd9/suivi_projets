import type { FieldType } from "@/generated/prisma/enums";

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  TEXT: "Texte",
  TEXTAREA: "Texte long",
  NUMBER: "Nombre",
  AMOUNT: "Montant",
  PERCENT: "Pourcentage",
  DATE: "Date",
  SELECT: "Liste déroulante",
  MULTISELECT: "Choix multiple",
  CHECKBOX: "Case à cocher",
  URL: "Lien",
};

/** Types dont les valeurs possibles sont à saisir dans la définition du champ. */
export const FIELD_TYPES_WITH_OPTIONS: FieldType[] = ["SELECT", "MULTISELECT"];

/** Types numériques, consolidables dans les tableaux de bord. */
export const NUMERIC_FIELD_TYPES: FieldType[] = ["NUMBER", "AMOUNT", "PERCENT"];

export const MULTISELECT_SEPARATOR = "|";

export type FieldDefinition = {
  label: string;
  fieldType: FieldType;
  options: string[];
  unit: string | null;
  required: boolean;
};

/** Valide et normalise une valeur saisie. Retourne l'erreur éventuelle. */
export function parseFieldValue(
  definition: FieldDefinition,
  raw: string | string[] | null,
): { value: string | null; error?: string } {
  const values = Array.isArray(raw) ? raw : raw === null ? [] : [raw];
  const single = (values[0] ?? "").trim();

  if (definition.fieldType === "CHECKBOX") {
    return { value: single === "on" || single === "true" ? "true" : "false" };
  }

  if (definition.fieldType === "MULTISELECT") {
    const chosen = values.map((v) => v.trim()).filter(Boolean);
    const unknown = chosen.find((v) => !definition.options.includes(v));
    if (unknown) return { value: null, error: `Valeur inconnue : ${unknown}.` };
    if (definition.required && chosen.length === 0) return { value: null, error: "Champ obligatoire." };
    return { value: chosen.length ? chosen.join(MULTISELECT_SEPARATOR) : null };
  }

  if (!single) {
    return definition.required ? { value: null, error: "Champ obligatoire." } : { value: null };
  }

  switch (definition.fieldType) {
    case "NUMBER":
    case "AMOUNT":
    case "PERCENT": {
      const normalized = single.replace(/\s/g, "").replace(",", ".");
      const numeric = Number(normalized);
      if (!Number.isFinite(numeric)) return { value: null, error: "Valeur numérique attendue." };
      if (definition.fieldType === "PERCENT" && (numeric < 0 || numeric > 100)) {
        return { value: null, error: "Le pourcentage doit être compris entre 0 et 100." };
      }
      return { value: String(numeric) };
    }
    case "DATE": {
      if (Number.isNaN(Date.parse(single))) return { value: null, error: "Date invalide." };
      return { value: single };
    }
    case "URL": {
      const withProtocol = /^https?:\/\//i.test(single) ? single : `https://${single}`;
      try {
        return { value: new URL(withProtocol).toString() };
      } catch {
        return { value: null, error: "Lien invalide." };
      }
    }
    case "SELECT": {
      if (!definition.options.includes(single)) return { value: null, error: "Valeur inconnue." };
      return { value: single };
    }
    default:
      return { value: single };
  }
}

const numberFormat = new Intl.NumberFormat("fr-FR");
const amountFormat = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

/** Rendu lisible d'une valeur enregistrée. */
export function formatFieldValue(definition: FieldDefinition, value: string | null): string {
  if (definition.fieldType === "CHECKBOX") return value === "true" ? "Oui" : "Non";
  if (!value) return "—";
  switch (definition.fieldType) {
    case "NUMBER":
      return `${numberFormat.format(Number(value))}${definition.unit ? ` ${definition.unit}` : ""}`;
    case "AMOUNT":
      return amountFormat.format(Number(value));
    case "PERCENT":
      return `${numberFormat.format(Number(value))} %`;
    case "DATE":
      return dateFormat.format(new Date(value));
    case "MULTISELECT":
      return value.split(MULTISELECT_SEPARATOR).join(", ");
    default:
      return value;
  }
}

/** Code technique proposé à partir du libellé : « Nombre de bénéficiaires » → NOMBRE_DE_BENEFICIAIRES */
export function suggestFieldCode(label: string) {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 30);
}
