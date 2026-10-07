"use client";

import { Printer } from "lucide-react";

/** Ouvre la boîte d'impression du navigateur (permet l'enregistrement en PDF). */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn btn-primary print:hidden">
      <Printer className="size-4" /> Imprimer / PDF
    </button>
  );
}
