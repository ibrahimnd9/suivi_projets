import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/** Dossier de stockage des pièces jointes (volume Docker en production). */
const ROOT = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");

export const MAX_FILE_SIZE = Number(process.env.MAX_UPLOAD_MB ?? 20) * 1024 * 1024;

/** Types acceptés : bureautique, PDF, images et archives courantes. */
const ALLOWED = new Map<string, string[]>([
  ["application/pdf", [".pdf"]],
  ["application/msword", [".doc"]],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", [".docx"]],
  ["application/vnd.ms-excel", [".xls"]],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", [".xlsx"]],
  ["application/vnd.ms-powerpoint", [".ppt"]],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", [".pptx"]],
  ["text/plain", [".txt"]],
  ["text/csv", [".csv"]],
  ["image/png", [".png"]],
  ["image/jpeg", [".jpg", ".jpeg"]],
  ["image/webp", [".webp"]],
  ["application/zip", [".zip"]],
]);

export const ALLOWED_EXTENSIONS = [...new Set([...ALLOWED.values()].flat())].sort().join(", ");

export function fileTypeError(file: File): string | null {
  if (file.size === 0) return "Fichier vide.";
  if (file.size > MAX_FILE_SIZE) {
    return `Fichier trop volumineux (maximum ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} Mo).`;
  }
  const extension = path.extname(file.name).toLowerCase();
  const expected = ALLOWED.get(file.type);
  if (!expected || !expected.includes(extension)) {
    return `Type de fichier non autorisé. Formats acceptés : ${ALLOWED_EXTENSIONS}.`;
  }
  return null;
}

/** Nom de fichier nettoyé, sans chemin ni caractère spécial. */
export function safeFileName(name: string) {
  return path
    .basename(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .slice(-120);
}

/** Enregistre le fichier et retourne sa clé de stockage. */
export async function storeFile(projectId: string, file: File) {
  const key = path.join(projectId, `${randomUUID()}${path.extname(safeFileName(file.name))}`);
  const target = path.join(ROOT, key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await file.arrayBuffer()));
  return key.replace(/\\/g, "/");
}

/** Lit un fichier stocké, en refusant toute clé qui sortirait du dossier. */
export async function readStoredFile(storageKey: string) {
  const target = path.resolve(ROOT, storageKey);
  if (!target.startsWith(ROOT + path.sep)) throw new Error("Clé de stockage invalide.");
  return readFile(target);
}

export async function deleteStoredFile(storageKey: string) {
  const target = path.resolve(ROOT, storageKey);
  if (!target.startsWith(ROOT + path.sep)) return;
  await unlink(target).catch(() => {});
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

/** Empreinte du contenu, utile pour repérer un dépôt identique. */
export const fileChecksum = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex").slice(0, 16);
