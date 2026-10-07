import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { canViewProject } from "@/lib/auth/permissions";
import { readStoredFile } from "@/lib/storage";

/** Téléchargement d'un document, réservé aux personnes autorisées sur le projet. */
export async function GET(_: Request, { params }: RouteContext<"/api/documents/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non autorisé", { status: 401 });

  const { id } = await params;
  const document = await db.document.findUnique({
    where: { id },
    include: { project: { include: { members: true } } },
  });
  if (!document) return new Response("Document introuvable", { status: 404 });
  if (!canViewProject(user, document.project)) return new Response("Accès refusé", { status: 403 });

  try {
    const content = await readStoredFile(document.storageKey);
    return new Response(new Uint8Array(content), {
      headers: {
        "Content-Type": document.mimeType,
        "Content-Length": String(content.length),
        "Content-Disposition": `attachment; filename="${document.fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("Fichier absent du stockage", { status: 410 });
  }
}
