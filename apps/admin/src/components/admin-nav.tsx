"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems: Array<{
  href: string;
  label: string;
  mark: string;
  contextualPaths?: string[];
}> = [
  { href: "/", label: "Dashboard", mark: "D" },
  { href: "/sessions", label: "Exams", mark: "E" },
  { href: "/invigilators", label: "Invigilators", mark: "I" },
  { href: "/attendance", label: "Attendance", mark: "A", contextualPaths: ["/mismatches"] },
  { href: "/incidents", label: "Incidents", mark: "!" },
  { href: "/health", label: "Health", mark: "H" }
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function isContextualPath(pathname: string, contextualPaths?: string[]) {
  return contextualPaths?.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ?? false;
}

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="admin-nav" aria-label="Admin navigation">
      {navItems.map((item) => {
        const currentPage = isActivePath(pathname, item.href);
        const active = currentPage || isContextualPath(pathname, item.contextualPaths);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? "active" : undefined}
            aria-current={currentPage ? "page" : undefined}
          >
            <span className="nav-mark">{item.mark}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
