"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const links = [
  { href: "/play", label: "Play" },
  { href: "/skills", label: "Skill Tree" },
  { href: "/progress", label: "Progress" },
  { href: "/profiles", label: "Profiles" }
];

export function BottomNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const childId = searchParams.get("child") ?? "";

  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-leaf/20 bg-white/95 px-4 py-3 backdrop-blur">
      <ul className="mx-auto flex max-w-xl items-center justify-around">
        {links.map((link) => {
          const active = pathname?.startsWith(link.href);
          const href = childId && link.href !== "/profiles" ? `${link.href}?child=${childId}` : link.href;
          return (
            <li key={link.href}>
              <Link
                href={href}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  active ? "bg-leaf text-white" : "bg-mint text-ink"
                }`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
