import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { maybeRunAlertScan, NOTIFICATION_TONES } from "@/lib/alerts";
import { getLastAlertScan } from "@/lib/settings";
import { Badge, EmptyState, PageHeader, formatDateTime } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { markAllRead, markNotificationRead, rescanAlerts } from "./actions";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const user = await requireUser();
  await maybeRunAlertScan();
  const { filtre } = await searchParams;
  const onlyUnread = filtre !== "toutes";

  const [notifications, unread, lastScan] = await Promise.all([
    db.notification.findMany({
      where: { userId: user.id, ...(onlyUnread ? { readAt: null } : {}) },
      orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
      take: 100,
    }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    getLastAlertScan(),
  ]);

  return (
    <>
      <PageHeader
        title="Centre de notifications"
        description={`${unread} alerte(s) non lue(s)${lastScan ? ` · dernière analyse le ${formatDateTime(lastScan)}` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {unread > 0 && (
              <form action={markAllRead}>
                <SubmitButton className="btn btn-secondary" pendingLabel="…">Tout marquer comme lu</SubmitButton>
              </form>
            )}
            {can(user.profile, "admin.referentiels") && (
              <form action={rescanAlerts}>
                <SubmitButton className="btn btn-secondary" pendingLabel="Analyse…">Relancer l’analyse</SubmitButton>
              </form>
            )}
          </div>
        }
      />

      <div className="mb-4 flex gap-2 text-sm">
        {[
          ["", "Non lues"],
          ["toutes", "Toutes"],
        ].map(([value, label]) => (
          <Link
            key={label}
            href={value ? `/notifications?filtre=${value}` : "/notifications"}
            className={`rounded-lg px-3 py-1.5 ${
              (value === "toutes") === !onlyUnread ? "bg-brand-100 font-semibold text-brand-800" : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      <section className="card">
        {notifications.length === 0 ? (
          <EmptyState>
            {onlyUnread ? "Aucune alerte non lue." : "Aucune notification."}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {notifications.map((notification) => (
              <li key={notification.id} className={`flex flex-wrap items-start gap-3 px-5 py-3 ${notification.readAt ? "opacity-60" : ""}`}>
                <Badge tone={NOTIFICATION_TONES[notification.level]}>{notification.level}</Badge>
                <div className="min-w-56 flex-1">
                  {notification.link ? (
                    <Link href={notification.link} className="font-medium text-brand-700 hover:underline">
                      {notification.title}
                    </Link>
                  ) : (
                    <span className="font-medium">{notification.title}</span>
                  )}
                  {notification.body && <p className="text-sm text-zinc-500">{notification.body}</p>}
                  <p className="text-xs text-zinc-400">{formatDateTime(notification.createdAt)}</p>
                </div>
                {!notification.readAt && (
                  <form action={markNotificationRead.bind(null, notification.id)}>
                    <SubmitButton className="btn btn-secondary px-2 py-1 text-xs" pendingLabel="…">Marquer lu</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-4 text-xs text-zinc-500">
        Les alertes sont recalculées automatiquement au maximum toutes les 30 minutes, à l’ouverture de l’application.
        L’envoi par email et l’intégration Microsoft Teams restent à brancher sur le serveur de messagerie.
      </p>
    </>
  );
}
