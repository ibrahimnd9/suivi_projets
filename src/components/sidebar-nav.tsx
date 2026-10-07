"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  CalendarDays,
  Clock,
  FileText,
  FolderKanban,
  Gauge,
  Home,
  ListChecks,
  ScrollText,
  SlidersHorizontal,
  CheckCheck,
  Bell,
  Settings,
  Upload,
  Compass,
  Network,
  ShieldAlert,
  Tags,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; soon?: boolean; badge?: number };
export type NavSection = { title?: string; items: NavItem[] };

const ICONS = {
  home: Home,
  portfolio: FolderKanban,
  actions: ListChecks,
  timesheet: Clock,
  kpi: Target,
  risks: ShieldAlert,
  dashboard: Gauge,
  reports: BarChart3,
  calendar: CalendarDays,
  users: Users,
  organisation: Building2,
  referentiels: Tags,
  audit: ScrollText,
  fields: SlidersHorizontal,
  validate: CheckCheck,
  bell: Bell,
  settings: Settings,
  import: Upload,
  strategy: Compass,
  ptba: Network,
  docs: FileText,
} satisfies Record<string, LucideIcon>;

export function SidebarNav({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {sections.map((section, i) => (
        <div key={i}>
          {section.title && (
            <p className="mb-2 px-3 text-[11px] font-semibold tracking-wider text-brand-200/70 uppercase">
              {section.title}
            </p>
          )}
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              if (item.soon) {
                return (
                  <li key={item.href}>
                    <span
                      title="Disponible dans une prochaine étape"
                      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-brand-200/50"
                    >
                      <Icon className="size-4" />
                      {item.label}
                      <span className="ml-auto rounded bg-white/10 px-1.5 text-[10px]">bientôt</span>
                    </span>
                  </li>
                );
              }
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                      active ? "bg-white/15 font-semibold text-white" : "text-brand-100 hover:bg-white/10"
                    }`}
                  >
                    <Icon className="size-4" />
                    {item.label}
                    {item.badge ? (
                      <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
