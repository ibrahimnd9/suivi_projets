"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ProjectTabs({ projectId, tabs }: { projectId: string; tabs: { slug: string; label: string }[] }) {
  const pathname = usePathname();
  const base = `/projets/${projectId}`;
  return (
    <>
      {tabs.map((tab) => {
        const href = tab.slug ? `${base}/${tab.slug}` : base;
        const active = pathname === href;
        return (
          <Link
            key={tab.slug}
            href={href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              active
                ? "border-brand-600 font-semibold text-brand-700"
                : "border-transparent text-zinc-600 hover:text-brand-600"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </>
  );
}
