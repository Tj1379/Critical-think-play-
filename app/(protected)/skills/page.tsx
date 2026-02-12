"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getChildSkillTree, listChildrenForCurrentParent } from "@/lib/data";
import type { ChildProfile } from "@/types/domain";

const ACTIVE_CHILD_KEY = "activeChildId";

type SkillTreeData = {
  tracks: Array<{
    skill: string;
    label: string;
    description: string;
    level: number;
    masteryScore: number;
    xp: number;
    dueReviews: number;
    xpToNext: number;
  }>;
  totalXp: number;
};

export default function SkillTreePage() {
  const router = useRouter();
  const params = useSearchParams();
  const [activeChild, setActiveChild] = useState<ChildProfile | null>(null);
  const [tree, setTree] = useState<SkillTreeData | null>(null);
  const [status, setStatus] = useState("Loading skill tree...");
  const [storedActiveId, setStoredActiveId] = useState("");

  useEffect(() => {
    setStoredActiveId(localStorage.getItem(ACTIVE_CHILD_KEY) || "");
  }, []);

  const childId = useMemo(() => params.get("child") || storedActiveId || "", [params, storedActiveId]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const rows = await listChildrenForCurrentParent();
        if (!mounted) return;

        const chosen = rows.find((item) => item.id === childId) ?? rows[0] ?? null;
        if (!chosen) {
          setStatus("Create a child profile to unlock the skill tree.");
          return;
        }

        localStorage.setItem(ACTIVE_CHILD_KEY, chosen.id);
        if (!params.get("child")) {
          router.replace(`/skills?child=${chosen.id}`);
        }

        setActiveChild(chosen);
        const data = await getChildSkillTree(chosen.id);
        if (!mounted) return;
        setTree(data);
        setStatus("");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to load skill tree");
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [childId, params, router]);

  if (status) {
    return (
      <section className="rounded-2xl bg-white/85 p-4">
        <p className="text-sm font-semibold text-ink/80">{status}</p>
      </section>
    );
  }

  if (!tree || !activeChild) return null;

  return (
    <section className="space-y-4">
      <article className="rounded-3xl bg-white/90 p-5 shadow-sm">
        <h2 className="text-xl font-black text-ink">{activeChild.name}&apos;s Skill Tree</h2>
        <p className="mt-1 text-sm text-ink/70">Facione tracks · Level up by mastery + strategy XP</p>
        <div className="mt-4 inline-flex items-center rounded-full bg-ink px-3 py-1 text-xs font-bold text-white">
          Total XP: {tree.totalXp}
        </div>
      </article>

      <div className="space-y-3">
        {tree.tracks.map((track) => {
          const percent = Math.round(track.masteryScore * 100);
          return (
            <article key={track.skill} className="rounded-2xl bg-white/90 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black text-ink">{track.label}</h3>
                  <p className="text-sm text-ink/70">{track.description}</p>
                </div>
                <div className="rounded-xl bg-leaf px-3 py-1 text-xs font-bold text-white">L{track.level}</div>
              </div>

              <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-3 rounded-full bg-gradient-to-r from-leaf to-emerald-400 transition-all duration-700"
                  style={{ width: `${percent}%` }}
                />
              </div>

              <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-ink/80">
                <span className="rounded-full bg-mint px-2 py-1">Mastery {percent}%</span>
                <span className="rounded-full bg-clay px-2 py-1">XP {track.xp}</span>
                {track.level < 5 && <span className="rounded-full bg-slate-100 px-2 py-1">XP to next {track.xpToNext}</span>}
                {track.dueReviews > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">Due reviews {track.dueReviews}</span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
