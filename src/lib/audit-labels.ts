export type Tone = "brand" | "green" | "red" | "amber" | "zinc";

export const AUDIT_ACTIONS: Record<string, { label: string; tone: Tone }> = {
  CREATE: { label: "Création", tone: "green" },
  UPDATE: { label: "Modification", tone: "brand" },
  DELETE: { label: "Suppression", tone: "red" },
  LOGIN: { label: "Connexion", tone: "zinc" },
  LOGOUT: { label: "Déconnexion", tone: "zinc" },
  LOGIN_FAILED: { label: "Échec de connexion", tone: "amber" },
  PASSWORD_CHANGE: { label: "Changement de mot de passe", tone: "zinc" },
  PASSWORD_RESET: { label: "Réinitialisation du mot de passe", tone: "amber" },
};

export const auditAction = (action: string) => AUDIT_ACTIONS[action] ?? { label: action, tone: "zinc" as Tone };
