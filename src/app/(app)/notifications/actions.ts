"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { runAlertScan } from "@/lib/alerts";

export async function markNotificationRead(notificationId: string) {
  const user = await requireUser();
  await db.notification.updateMany({
    where: { id: notificationId, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}

export async function markAllRead() {
  const user = await requireUser();
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/notifications");
}

/** Relance manuelle de l'analyse des alertes (administrateur). */
export async function rescanAlerts() {
  const user = await requireUser();
  if (!can(user.profile, "admin.referentiels")) return;
  await runAlertScan();
  revalidatePath("/notifications");
  revalidatePath("/mes-actions");
}
