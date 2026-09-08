"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems: Array<{
  href: string;
  label: string;
  icon: NavIconName;
  contextualPaths?: string[];
}> = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/sessions", label: "Exams", icon: "exams" },
  { href: "/invigilators", label: "Invigilators", icon: "invigilators" },
  { href: "/attendance", label: "Attendance", icon: "attendance", contextualPaths: ["/mismatches"] },
  { href: "/incidents", label: "Incidents", icon: "incidents" },
  { href: "/health", label: "Health", icon: "health" }
];

type NavIconName = "attendance" | "dashboard" | "exams" | "health" | "incidents" | "invigilators";

function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg
      aria-hidden="true"
      className="nav-icon"
      fill="none"
      focusable="false"
      height="18"
      viewBox="0 0 24 24"
      width="18"
    >
      {name === "dashboard" ? (
        <>
          <path d="M4 10.5L12 4L20 10.5V20H4V10.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M9 20V15H15V20" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        </>
      ) : null}
      {name === "exams" ? (
        <>
          <path d="M6 5H18V20H6V5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M9 5V3.5H15V5M9 10H15M9 14H15" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </>
      ) : null}
      {name === "invigilators" ? (
        <>
          <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3.5 19C3.5 15.9 5.8 14 9 14C12.2 14 14.5 15.9 14.5 19" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
          <path d="M15 5.5C17.8 5.6 19.5 7.1 19.5 9.3C19.5 11.1 18.4 12.3 16.6 12.8M16 15C18.6 15.4 20 16.8 20.5 19" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </>
      ) : null}
      {name === "attendance" ? (
        <>
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8 12L10.8 14.8L16.5 9.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </>
      ) : null}
      {name === "incidents" ? (
        <>
          <path d="M12 4L21 20H3L12 4Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M12 9V13M12 16.5V16.6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </>
      ) : null}
      {name === "health" ? (
        <path d="M3 12H7L9.5 6L14 18L16.5 12H21" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      ) : null}
    </svg>
  );
}

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
            <NavIcon name={item.icon} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
