"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { listChildrenForCurrentParent } from "@/lib/data";
import type { ChildProfile } from "@/types/domain";

const ACTIVE_CHILD_KEY = "activeChildId";

export function ProfileSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [children, setChildren] = useState<ChildProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [storedActiveId, setStoredActiveId] = useState("");

  useEffect(() => {
    setStoredActiveId(localStorage.getItem(ACTIVE_CHILD_KEY) || "");
  }, []);

  const activeId = useMemo(() => params.get("child") || storedActiveId || "", [params, storedActiveId]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const rows = await listChildrenForCurrentParent();
      if (!mounted) return;
      setChildren(rows);
      setLoading(false);
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const onSelect = (childId: string) => {
    localStorage.setItem(ACTIVE_CHILD_KEY, childId);
    setStoredActiveId(childId);
    const next = new URLSearchParams(params.toString());
    next.set("child", childId);
    router.replace(`${pathname}?${next.toString()}`);
  };

  if (loading) {
    return null;
  }

  return (
    <div className="w-full rounded-2xl bg-white/80 p-3 shadow-sm">
      <label htmlFor="profile-switch" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink/80">
        Active Profile
      </label>
      <select
        id="profile-switch"
        value={activeId}
        onChange={(event) => onSelect(event.target.value)}
        className="w-full rounded-xl border border-leaf/30 bg-white px-3 py-2 text-sm"
      >
        {!activeId && <option value="">Select a child</option>}
        {children.map((child) => (
          <option value={child.id} key={child.id}>
            {child.name} ({child.age_band})
          </option>
        ))}
      </select>
    </div>
  );
}
