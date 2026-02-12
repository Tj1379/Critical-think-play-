"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getChildWeeklyReport, listChildrenForCurrentParent } from "@/lib/data";
import { SKILL_LABELS } from "@/lib/skills";
import type { ChildProfile, CtSkill } from "@/types/domain";

const ACTIVE_CHILD_KEY = "activeChildId";

type WeeklyData = {
  childId: string;
  range: {
    from: string;
    to: string;
  };
  roundsThisWeek: number;
  sessionsThisWeek: number;
  firstTryAccuracy: number;
  masteryAccuracy: number;
  strategyRecoveries: number;
  streak: number;
  daily: Array<{
    date: string;
    rounds: number;
    firstTryAccuracy: number;
  }>;
  skillTrends: Array<{
    skill: CtSkill;
    label: string;
    attempts: number;
    accuracy: number;
    deltaVsLastWeek: number;
  }>;
  wins: string[];
  focusSkill: CtSkill;
  coachNotes: string[];
};

export default function WeeklyReportPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [activeChild, setActiveChild] = useState<ChildProfile | null>(null);
  const [report, setReport] = useState<WeeklyData | null>(null);
  const [status, setStatus] = useState("Loading weekly report...");
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
          setStatus("Create a child profile to see weekly growth.");
          return;
        }

        localStorage.setItem(ACTIVE_CHILD_KEY, chosen.id);
        if (!params.get("child")) {
          router.replace(`/weekly?child=${chosen.id}`);
        }

        setActiveChild(chosen);
        const weekly = await getChildWeeklyReport(chosen.id);
        if (!mounted) return;
        setReport(weekly as WeeklyData);
        setStatus("");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to load weekly report");
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

  if (!report || !activeChild) return null;

  const maxRounds = Math.max(1, ...report.daily.map((item) => item.rounds));

  return (
    <section className="space-y-4">
      <article className="rounded-3xl bg-white/90 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-leaf">Parent Weekly Report</p>
            <h2 className="mt-1 text-2xl font-black text-ink">{activeChild.name}</h2>
            <p className="text-xs text-ink/70">
              {report.range.from} to {report.range.to}
            </p>
          </div>
          <button
            className="rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-white"
            onClick={() => router.push(`/progress?child=${activeChild.id}`)}
          >
            Back to Progress
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-2xl bg-mint p-3">
            <p className="text-xs font-semibold uppercase text-ink/70">Rounds</p>
            <p className="text-2xl font-black text-leaf">{report.roundsThisWeek}</p>
          </div>
          <div className="rounded-2xl bg-mint p-3">
            <p className="text-xs font-semibold uppercase text-ink/70">Sessions</p>
            <p className="text-2xl font-black text-leaf">{report.sessionsThisWeek}</p>
          </div>
          <div className="rounded-2xl bg-clay p-3">
            <p className="text-xs font-semibold uppercase text-ink/70">First-Try</p>
            <p className="text-2xl font-black text-ink">{report.firstTryAccuracy}%</p>
          </div>
          <div className="rounded-2xl bg-clay p-3">
            <p className="text-xs font-semibold uppercase text-ink/70">Mastery</p>
            <p className="text-2xl font-black text-ink">{report.masteryAccuracy}%</p>
          </div>
        </div>
      </article>

      <article className="rounded-2xl bg-white/90 p-4 shadow-sm">
        <h3 className="text-lg font-bold text-ink">Daily Momentum</h3>
        <div className="mt-3 flex h-36 items-end gap-2">
          {report.daily.map((point) => {
            const height = Math.max(8, Math.round((point.rounds / maxRounds) * 100));
            return (
              <div key={point.date} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full rounded-t-md bg-leaf/80 transition-all duration-700" style={{ height: `${height}%` }} />
                <span className="text-[10px] font-semibold text-ink/70">{point.date.slice(5)}</span>
              </div>
            );
          })}
        </div>
      </article>

      <article className="rounded-2xl bg-white/90 p-4 shadow-sm">
        <h3 className="text-lg font-bold text-ink">Skill Trends (vs last week)</h3>
        <ul className="mt-2 space-y-2">
          {report.skillTrends.map((item) => {
            const delta = item.deltaVsLastWeek;
            const deltaLabel = `${delta > 0 ? "+" : ""}${delta}%`;
            return (
              <li key={item.skill} className="rounded-xl bg-clay px-3 py-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-ink">{SKILL_LABELS[item.skill] ?? item.label}</span>
                  <span className="font-bold text-ink">{item.accuracy}%</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-ink/70">{item.attempts} rounds</span>
                  <span className={delta >= 0 ? "font-bold text-emerald-700" : "font-bold text-rose-700"}>{deltaLabel}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </article>

      <article className="rounded-2xl bg-white/90 p-4 shadow-sm">
        <h3 className="text-lg font-bold text-ink">Wins</h3>
        <ul className="mt-2 space-y-2">
          {report.wins.map((win) => (
            <li key={win} className="rounded-xl bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-900">
              {win}
            </li>
          ))}
        </ul>
      </article>

      <article className="rounded-2xl bg-white/90 p-4 shadow-sm">
        <h3 className="text-lg font-bold text-ink">Coach Notes</h3>
        <ul className="mt-2 space-y-2">
          {report.coachNotes.map((note) => (
            <li key={note} className="rounded-xl bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-900">
              {note}
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}

