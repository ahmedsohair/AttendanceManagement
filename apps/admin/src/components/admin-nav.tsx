"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard", mark: "D" },
  { href: "/sessions", label: "Exams", mark: "E" },
  { href: "/invigilators", label: "Invigilators", mark: "I" },
  { href: "/attendance", label: "Attendance", mark: "A" },
  { href: "/incidents", label: "Incidents", mark: "!" }
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="admin-nav" aria-label="Admin navigation">
      {navItems.map((item) => {
        const active = isActivePath(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? "active" : undefined}
            aria-current={active ? "page" : undefined}
          >
            <span className="nav-mark">{item.mark}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
