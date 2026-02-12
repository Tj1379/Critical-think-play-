"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getChildProgress, listChildrenForCurrentParent } from "@/lib/data";
import { SKILL_LABELS } from "@/lib/skills";
import type { ChildProfile } from "@/types/domain";

const ACTIVE_CHILD_KEY = "activeChildId";

type ProgressData = {
  streak: number;
  completions: number;
  accuracy: number;
  bySkill: Array<{ skill: string; accuracy: number; attempts: number }>;
  badges: number[];
  badgeKeys: string[];
  growth: Array<{ date: string; completions: number; accuracy: number }>;
  wins: string[];
  xpTotal: number;
  skillLevels: Array<{ skill: string; level: number; masteryScore: number; xp: number }>;
};

export default function ProgressPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [activeChild, setActiveChild] = useState<ChildProfile | null>(null);
  const [status, setStatus] = useState("Loading progress...");
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [storedActiveId, setStoredActiveId] = useState("");

  useEffect(() => {
    setStoredActiveId(localStorage.getItem(ACTIVE_CHILD_KEY) || "");
  }, []);

  const childId = useMemo(() => params.get("child") || storedActiveId || "", [params, storedActiveId]);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const rows = await listChildrenForCurrentParent();
        if (!mounted) return;
        const chosen = rows.find((item) => item.id === childId) ?? rows[0] ?? null;

        if (!chosen) {
          setStatus("Create a child profile to view progress.");
          return;
        }

        localStorage.setItem(ACTIVE_CHILD_KEY, chosen.id);
        if (!params.get("child")) {
          router.replace(`/progress?child=${chosen.id}`);
        }

        setActiveChild(chosen);
        const data = await getChildProgress(chosen.id);
        if (!mounted) return;

        setProgress(data);
        setStatus("");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to load progress");
      }
    }

    init();
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

  if (!progress || !activeChild) {
    return null;
  }

  const maxCompletions = Math.max(1, ...progress.growth.map((item) => item.completions));

  return (
    <section className="space-y-4">
      <article className="rounded-3xl bg-white/90 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-black text-ink">{activeChild.name}&apos;s Growth</h2>
          <button
            className="rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-white"
            onClick={() => router.push(`/weekly?child=${activeChild.id}`)}
          >
            Weekly Report
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-2xl bg-mint p-3">
            <p className="text-xs font-semibold uppercase text-ink/70">Streak</p>
            <p className="text-2xl font-black text-leaf">{progress.streak}</p>
          </div>
          <div className="rounded-2xl bg-mint p-3">
            <p className="text-xs font-semibold uppercase text-ink/70">Accuracy</p>
            <p className="text-2xl font-black text-leaf">{progress.accuracy}%</p>
          </div>
          <div className="rounded-2xl bg-clay p-3">
            <p className="text-xs font-semibold uppercase text-ink/70">Completed</p>
            <p className="text-2xl font-black text-ink">{progress.completions}</p>
          </div>
          <div className="rounded-2xl bg-clay p-3">
            <p className="text-xs font-semibold uppercase text-ink/70">Total XP</p>
            <p className="text-2xl font-black text-ink">{progress.xpTotal}</p>
          </div>
        </div>
      </article>

      <article className="rounded-2xl bg-white/90 p-4 shadow-sm">
        <h3 className="text-lg font-bold text-ink">Growth Over Time (14 days)</h3>
        {progress.growth.length === 0 ? (
          <p className="mt-2 text-sm text-ink/70">No sessions yet.</p>
        ) : (
          <div className="mt-3 flex h-36 items-end gap-2">
            {progress.growth.map((point) => {
              const height = Math.max(10, Math.round((point.completions / maxCompletions) * 100));
              return (
                <div key={point.date} className="flex flex-1 flex-col items-center gap-1">
                  <div className="w-full rounded-t-md bg-leaf/80 transition-all duration-700" style={{ height: `${height}%` }} />
                  <span className="text-[10px] font-semibold text-ink/70">{point.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        )}
      </article>

      <article className="rounded-2xl bg-white/90 p-4 shadow-sm">
        <h3 className="text-lg font-bold text-ink">Skill Tracks</h3>
        <ul className="mt-2 space-y-2">
          {progress.skillLevels.length === 0 ? (
            <li className="text-sm text-ink/70">Skill tracks will appear after first adaptive session.</li>
          ) : (
            progress.skillLevels.map((item) => (
              <li key={item.skill} className="rounded-xl bg-mint p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-ink">{SKILL_LABELS[item.skill as keyof typeof SKILL_LABELS] ?? item.skill}</span>
                  <span className="font-black text-leaf">L{item.level}</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/70">
                  <div className="h-2 rounded-full bg-leaf" style={{ width: `${Math.round(item.masteryScore * 100)}%` }} />
                </div>
              </li>
            ))
          )}
        </ul>
      </article>

      <article className="rounded-2xl bg-white/90 p-4 shadow-sm">
        <h3 className="text-lg font-bold text-ink">Wins</h3>
        {progress.wins.length === 0 ? (
          <p className="mt-2 text-sm text-ink/70">Complete a few sessions to unlock wins.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {progress.wins.map((win) => (
              <li key={win} className="rounded-xl bg-clay px-3 py-2 text-sm font-semibold text-ink">
                {win}
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="rounded-2xl bg-white/90 p-4 shadow-sm">
        <h3 className="text-lg font-bold text-ink">Badges</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {[10, 25, 50].map((threshold) => {
            const earned = progress.badges.includes(threshold);
            return (
              <div
                key={threshold}
                className={`rounded-full px-3 py-1 text-xs font-bold ${earned ? "bg-leaf text-white" : "bg-slate-100 text-slate-500"}`}
              >
                {threshold} Completed
              </div>
            );
          })}
        </div>
        {progress.badgeKeys.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {progress.badgeKeys.slice(0, 10).map((badge) => (
              <span key={badge} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900 animate-badge-pop">
                {badge.replaceAll("_", " ")}
              </span>
            ))}
          </div>
        )}
      </article>

      <article className="rounded-2xl bg-white/90 p-4 shadow-sm">
        <h3 className="text-lg font-bold text-ink">Accuracy by Skill</h3>
        {progress.bySkill.length === 0 ? (
          <p className="mt-2 text-sm text-ink/70">No attempts yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {progress.bySkill.map((item) => (
              <li key={item.skill} className="flex items-center justify-between rounded-xl bg-clay px-3 py-2 text-sm">
                <span className="font-semibold text-ink">{SKILL_LABELS[item.skill as keyof typeof SKILL_LABELS] ?? item.skill}</span>
                <span className="font-bold text-ink">
                  {item.accuracy}% ({item.attempts})
                </span>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}
