import Link from "next/link";
import { LogOut, Menu, UserRound } from "lucide-react";
import { requireUser, displayName } from "@/lib/auth/session";
import { can, PROFILE_LABELS } from "@/lib/auth/permissions";
import { logout } from "@/app/login/actions";
import { SidebarNav, type NavSection } from "@/components/sidebar-nav";
import { db } from "@/lib/db";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser({ allowPendingPassword: true });

  const sections: NavSection[] = [
    {
      items: [
        { href: "/", label: "Accueil", icon: "home" },
        { href: "/mes-actions", label: "Mes actions", icon: "actions" },
        { href: "/strategie", label: "Stratégie", icon: "strategy" },
        { href: "/ptba", label: "PTBA", icon: "ptba" },
        { href: "/portefeuille", label: "Portefeuille", icon: "portfolio" },
        { href: "/temps", label: "Ma fiche de temps", icon: "timesheet" },
        { href: "/tableau-de-bord", label: "Tableau de bord", icon: "dashboard" },
        { href: "/calendrier", label: "Calendrier", icon: "calendar" },
        { href: "/rapports", label: "Rapports & exports", icon: "reports" },
      ],
    },
  ];

  const unread = await db.notification.count({ where: { userId: user.id, readAt: null } });
  sections[0].items.push({ href: "/notifications", label: "Notifications", icon: "bell", badge: unread || undefined });

  // Validation des temps : visible pour les valideurs (N+1) et l'administrateur
  const reportCount = await db.user.count({ where: { managerId: user.id, active: true } });
  if (reportCount > 0 || user.profile === "ADMIN") {
    sections[0].items.push({ href: "/temps/validation", label: "Validation des temps", icon: "validate" });
  }

  const admin: NavSection = { title: "Administration", items: [] };
  if (can(user.profile, "admin.users")) admin.items.push({ href: "/admin/utilisateurs", label: "Utilisateurs", icon: "users" });
  if (can(user.profile, "admin.organisation")) admin.items.push({ href: "/admin/organisation", label: "Directions & pôles", icon: "organisation" });
  if (can(user.profile, "admin.referentiels")) admin.items.push({ href: "/admin/referentiels", label: "Référentiels", icon: "referentiels" });
  if (can(user.profile, "admin.customFields")) admin.items.push({ href: "/admin/rubriques", label: "Rubriques", icon: "fields" });
  if (can(user.profile, "admin.users")) admin.items.push({ href: "/admin/import", label: "Import de données", icon: "import" });
  if (can(user.profile, "admin.referentiels")) admin.items.push({ href: "/admin/parametres", label: "Paramètres", icon: "settings" });
  if (can(user.profile, "admin.audit")) admin.items.push({ href: "/admin/journal", label: "Journal", icon: "audit" });
  if (admin.items.length) sections.push(admin);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-brand-800 md:flex print:hidden">
        <Link href="/" className="block px-6 pt-6 pb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/synap-suivi-logo-blanc.svg" alt="SYNAP-SUIVI" className="w-full" />
        </Link>
        <SidebarNav sections={sections} />
        <div className="border-t border-white/10 p-3">
          <Link href="/compte" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-brand-100 hover:bg-white/10">
            <UserRound className="size-4 shrink-0" />
            <span className="min-w-0">
              <span className="block truncate font-semibold text-white">{displayName(user)}</span>
              <span className="block truncate text-xs text-brand-200">{PROFILE_LABELS[user.profile]}</span>
            </span>
          </Link>
          <form action={logout}>
            <button className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-brand-100 hover:bg-white/10">
              <LogOut className="size-4" /> Se déconnecter
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barre compacte pour mobile */}
        <details className="relative bg-brand-800 md:hidden print:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/synap-suivi-logo-blanc.svg" alt="SYNAP-SUIVI" className="h-7" />
            <Menu className="size-6 text-brand-100" aria-label="Menu" />
          </summary>
          <div className="absolute inset-x-0 z-20 bg-brand-800 pb-3 shadow-lg">
            <SidebarNav sections={sections} />
            <div className="flex gap-2 px-6">
              <Link href="/compte" className="btn btn-secondary flex-1">Mon compte</Link>
              <form action={logout} className="flex-1">
                <button className="btn btn-secondary w-full">
                  <LogOut className="size-4" /> Déconnexion
                </button>
              </form>
            </div>
          </div>
        </details>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-8 print:max-w-none print:p-0">{children}</main>
      </div>
    </div>
  );
}
