import "server-only";

/** Échappe une valeur pour le format CSV. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Fichier CSV lisible par Excel en français : séparateur point-virgule,
 * BOM UTF-8 pour les accents, et virgule décimale.
 */
export function csvResponse(filename: string, headers: string[], rows: unknown[][]) {
  const lines = [headers.join(";"), ...rows.map((row) => row.map(cell).join(";"))];
  const body = `﻿${lines.join("\r\n")}`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

export const decimal = (value: { toString(): string } | null | undefined) =>
  value === null || value === undefined ? "" : value.toString().replace(".", ",");
