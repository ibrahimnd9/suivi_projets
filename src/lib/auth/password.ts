import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";

const ROUNDS = 12;

export const PASSWORD_RULES =
  "Au moins 10 caractères, dont une majuscule, une minuscule, un chiffre et un caractère spécial.";

export function passwordPolicyError(password: string): string | null {
  if (password.length < 10) return "Le mot de passe doit contenir au moins 10 caractères.";
  if (!/[A-Z]/.test(password)) return "Le mot de passe doit contenir une majuscule.";
  if (!/[a-z]/.test(password)) return "Le mot de passe doit contenir une minuscule.";
  if (!/[0-9]/.test(password)) return "Le mot de passe doit contenir un chiffre.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Le mot de passe doit contenir un caractère spécial.";
  return null;
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, ROUNDS);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

/** Mot de passe temporaire conforme à la politique (communiqué une seule fois). */
export function generateTemporaryPassword() {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "@#$%&*!?"];
  const all = sets.join("");
  const chars = sets.map((s) => s[randomInt(s.length)]);
  while (chars.length < 12) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
