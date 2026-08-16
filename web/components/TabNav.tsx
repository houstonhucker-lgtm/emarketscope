"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/weekly", label: "Weekly" },
  { href: "/monthly", label: "Monthly" },
  { href: "/quarterly", label: "Quarterly" },
  // Calendar first among the "content" tabs in visual weight, but kept in
  // this order in the nav bar to match the spec's tab list; it's the
  // default landing route (see app/page.tsx) since it's expected to be
  // referenced most frequently.
  { href: "/calendar", label: "Calendar" },
  { href: "/capture", label: "Capture" },
] as const;

export default function TabNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-neutral-200 px-2 dark:border-neutral-800">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={
              "whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors " +
              (active
                ? "border-neutral-900 text-neutral-900 dark:border-neutral-100 dark:text-neutral-100"
                : "border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200")
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
