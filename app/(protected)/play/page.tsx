"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { generateFeedback, type FeedbackOutput } from "@/lib/feedback";
import {
  finalizeAdaptiveRound,
  getChildAdaptiveSettings,
  getDailyQuestState,
  getNextAdaptiveRound,
  listChildrenForCurrentParent,
  logAttemptResponse,
  type AdaptiveRound,
  type DailyQuestState,
  type SessionStep
} from "@/lib/data";
import { SKILL_LABELS, type CtSkill } from "@/lib/skills";
import type { ChildAdaptiveSettings, ChildProfile } from "@/types/domain";

const ACTIVE_CHILD_KEY = "activeChildId";
const DEFAULT_SESSION_STEPS: SessionStep[] = ["warmup", "main", "boss"];

type SessionStats = {
  xp: number;
  strategyXp: number;
  correct: number;
  firstTryCorrect: number;
  recoveries: number;
  hintsUsed: number;
  streak: number;
  rounds: number;
  badges: string[];
  levelUps: Array<{ skill: CtSkill; level: number }>;
  bySkill: Partial<Record<CtSkill, { attempts: number; correct: number }>>;
};

const EMPTY_STATS: SessionStats = {
  xp: 0,
  strategyXp: 0,
  correct: 0,
  firstTryCorrect: 0,
  recoveries: 0,
  hintsUsed: 0,
  streak: 0,
  rounds: 0,
  badges: [],
  levelUps: [],
  bySkill: {}
};

export default function PlayPage() {
  const router = useRouter();
  const params = useSearchParams();

  const [children, setChildren] = useState<ChildProfile[]>([]);
  const [activeChild, setActiveChild] = useState<ChildProfile | null>(null);
  const [status, setStatus] = useState("Loading...");
  const [adaptiveSettings, setAdaptiveSettings] = useState<ChildAdaptiveSettings | null>(null);
  const [dailyQuest, setDailyQuest] = useState<DailyQuestState | null>(null);

  const [sessionIndex, setSessionIndex] = useState(0);
  const [usedActivityIds, setUsedActivityIds] = useState<string[]>([]);
  const [round, setRound] = useState<AdaptiveRound | null>(null);
  const [roundStartedAt, setRoundStartedAt] = useState<number>(Date.now());

  const [choice, setChoice] = useState<number | null>(null);
  const [choiceOrder, setChoiceOrder] = useState<Array<{ label: string; originalIndex: number }>>([]);
  const [attemptNumber, setAttemptNumber] = useState<1 | 2>(1);
  const [usedHint, setUsedHint] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackOutput | null>(null);
  const [roundFinalized, setRoundFinalized] = useState(false);

  const [stats, setStats] = useState<SessionStats>(EMPTY_STATS);
  const [celebration, setCelebration] = useState<string>("");

  const sessionPhases = useMemo<SessionStep[]>(() => {
    if (!adaptiveSettings) return DEFAULT_SESSION_STEPS;
    const mainRounds = Math.max(1, Math.min(4, adaptiveSettings.main_rounds));
    const phases: SessionStep[] = ["warmup", ...Array.from({ length: mainRounds }, () => "main" as const)];
    if (adaptiveSettings.boss_enabled) phases.push("boss");
    return phases;
  }, [adaptiveSettings]);

  const currentStep = sessionIndex < sessionPhases.length ? sessionPhases[sessionIndex] : "recap";
  const isYoung = useMemo(() => activeChild?.age_band === "4-6", [activeChild]);

  useEffect(() => {
    let mounted = true;

    async function initChild() {
      try {
        const rows = await listChildrenForCurrentParent();
        if (!mounted) return;
        setChildren(rows);

        const queryChild = params.get("child");
        const localChild = localStorage.getItem(ACTIVE_CHILD_KEY);
        const selectedId = queryChild || localChild || rows[0]?.id;

        if (!selectedId) {
          setStatus("Create a child profile first.");
          return;
        }

        localStorage.setItem(ACTIVE_CHILD_KEY, selectedId);
        if (!queryChild) {
          router.replace(`/play?child=${selectedId}`);
        }

        const child = rows.find((item) => item.id === selectedId) ?? null;
        setActiveChild(child);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to load child profile");
      }
    }

    initChild();
    return () => {
      mounted = false;
    };
  }, [params, router]);

  useEffect(() => {
    let mounted = true;
    async function loadAdaptiveSettings() {
      if (!activeChild) return;
      try {
        const settings = await getChildAdaptiveSettings(activeChild.id);
        if (!mounted) return;
        setAdaptiveSettings(settings);
      } catch {
        if (!mounted) return;
        setAdaptiveSettings(null);
      }
    }
    loadAdaptiveSettings();
    return () => {
      mounted = false;
    };
  }, [activeChild]);

  useEffect(() => {
    let mounted = true;
    async function loadDailyQuest() {
      if (!activeChild) return;
      try {
        const quest = await getDailyQuestState(activeChild.id, adaptiveSettings ?? undefined);
        if (!mounted) return;
        setDailyQuest(quest);
      } catch {
        if (!mounted) return;
        setDailyQuest(null);
      }
    }
    loadDailyQuest();
    return () => {
      mounted = false;
    };
  }, [activeChild, adaptiveSettings]);

  useEffect(() => {
    let mounted = true;

    async function loadRound() {
      if (!activeChild || sessionIndex >= sessionPhases.length) return;
      setStatus("Preparing adaptive challenge...");

      try {
        const step = sessionPhases[sessionIndex] ?? "main";
        const next = await getNextAdaptiveRound({
          childId: activeChild.id,
          ageBand: activeChild.age_band,
          sessionStep: step,
          excludeActivityIds: usedActivityIds,
          adaptiveSettings: adaptiveSettings
            ? {
                boss_intensity: adaptiveSettings.boss_intensity
              }
            : undefined
        });

        if (!mounted) return;

        if (!next) {
          setStatus("No matching activities found for this profile right now.");
          return;
        }

        setRound(next);
        setChoice(null);
        setChoiceOrder([]);
        setAttemptNumber(1);
        setUsedHint(false);
        setFeedback(null);
        setRoundFinalized(false);
        setRoundStartedAt(Date.now());
        setCelebration("");
        setStatus("");
      } catch (error) {
        if (!mounted) return;
        const message = error instanceof Error ? error.message : "Failed to prepare challenge.";
        setStatus(`Could not load adaptive round. ${message}`);
      }
    }

    loadRound();
    return () => {
      mounted = false;
    };
  }, [activeChild, adaptiveSettings, sessionIndex, sessionPhases, usedActivityIds]);

  useEffect(() => {
    if (!round) return;
    const shuffled = round.activity.content.choices
      .map((label, originalIndex) => ({ label, originalIndex, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ label, originalIndex }) => ({ label, originalIndex }));
    setChoiceOrder(shuffled);
  }, [round]);

  const handleSubmit = async () => {
    if (!activeChild || !round || choice === null) return;

    const content = round.activity.content as {
      correctIndex?: number;
      correctChoiceIndex?: number;
      choices: string[];
      explanation: string;
      tip: string;
    };
    const resolvedCorrectIndex = Number.isInteger(content.correctIndex)
      ? Number(content.correctIndex)
      : Number(content.correctChoiceIndex ?? 0);
    const isCorrect = choice === resolvedCorrectIndex;
    const responseTimeMs = Date.now() - roundStartedAt;

    await logAttemptResponse({
      childId: activeChild.id,
      activityId: round.activity.id,
      choiceIndex: choice,
      isCorrect,
      attemptNumber,
      responseTimeMs,
      sessionMode: round.plan.mode,
      skill: round.plan.skill,
      usedHint
    });

    const responseFeedback = generateFeedback({
      ageBand: activeChild.age_band,
      skill: round.plan.skill,
      isCorrect,
      correctChoice: content.choices[resolvedCorrectIndex] ?? "",
      chosenChoice: content.choices[choice] ?? "",
      explanation: content.explanation,
      strategyTip: content.tip,
      attemptNumber
    });

    if (adaptiveSettings?.hint_mode === "minimal" && responseFeedback.hint) {
      responseFeedback.hint = "Hint: focus on direct evidence and remove weak options.";
    }
    if (adaptiveSettings?.hint_mode === "off" && responseFeedback.hint) {
      responseFeedback.hint = "Hint: use your strategy tip and compare evidence carefully.";
    }

    setFeedback(responseFeedback);

    if (!isCorrect && attemptNumber === 1) {
      setAttemptNumber(2);
      setUsedHint(true);
      setChoice(null);
      setCelebration("Use the hint and retry once.");
      return;
    }

    const finalized = await finalizeAdaptiveRound({
      childId: activeChild.id,
      activity: round.activity,
      plan: round.plan,
      finalCorrect: isCorrect,
      attemptNumber,
      usedHint
    });

    setRoundFinalized(true);

    setStats((prev) => ({
      bySkill: {
        ...prev.bySkill,
        [round.plan.skill]: {
          attempts: (prev.bySkill[round.plan.skill]?.attempts ?? 0) + 1,
          correct: (prev.bySkill[round.plan.skill]?.correct ?? 0) + (isCorrect ? 1 : 0)
        }
      },
      xp: prev.xp + finalized.xpAwarded,
      strategyXp: prev.strategyXp + finalized.strategyXp,
      correct: prev.correct + (isCorrect ? 1 : 0),
      firstTryCorrect: prev.firstTryCorrect + (isCorrect && attemptNumber === 1 ? 1 : 0),
      recoveries: prev.recoveries + (isCorrect && attemptNumber === 2 ? 1 : 0),
      hintsUsed: prev.hintsUsed + (attemptNumber === 2 || usedHint ? 1 : 0),
      streak: finalized.streak,
      rounds: prev.rounds + 1,
      badges: [...prev.badges, ...finalized.newBadges],
      levelUps: finalized.leveledUp ? [...prev.levelUps, { skill: round.plan.skill, level: finalized.newLevel }] : prev.levelUps
    }));

    const celebrationParts: string[] = [];
    if (responseFeedback.celebrate) celebrationParts.push(responseFeedback.celebrate);
    if (finalized.leveledUp) celebrationParts.push(`Level up! ${SKILL_LABELS[round.plan.skill]} reached level ${finalized.newLevel}.`);
    if (finalized.newBadges.length > 0) celebrationParts.push(`New badge: ${finalized.newBadges[0].replaceAll("_", " ")}`);
    if (celebrationParts.length === 0) celebrationParts.push(`+${finalized.xpAwarded} XP earned.`);

    setCelebration(celebrationParts.join(" "));
    try {
      const refreshedQuest = await getDailyQuestState(activeChild.id, adaptiveSettings ?? undefined);
      setDailyQuest(refreshedQuest);
    } catch {
      setDailyQuest(null);
    }
  };

  const advance = () => {
    if (!round) return;

    const nextUsed = [...usedActivityIds, round.activity.id];
    setUsedActivityIds(nextUsed);

    if (sessionIndex < sessionPhases.length - 1) {
      setSessionIndex((prev) => prev + 1);
      return;
    }

    setSessionIndex(sessionPhases.length);
  };

  const startNewSession = () => {
    setSessionIndex(0);
    setUsedActivityIds([]);
    setStats(EMPTY_STATS);
    setRound(null);
    setFeedback(null);
    setRoundFinalized(false);
    setStatus("Preparing adaptive challenge...");
  };

  const sessionAccuracy = stats.rounds > 0 ? Math.round((stats.correct / stats.rounds) * 100) : 0;
  const sessionFirstTryRate = stats.rounds > 0 ? Math.round((stats.firstTryCorrect / stats.rounds) * 100) : 0;
  const skillEntries = Object.entries(stats.bySkill) as Array<[CtSkill, { attempts: number; correct: number }]>;
  const strongestSkill =
    skillEntries.length > 0
      ? [...skillEntries]
          .sort((a, b) => {
            const aAcc = a[1].attempts > 0 ? a[1].correct / a[1].attempts : 0;
            const bAcc = b[1].attempts > 0 ? b[1].correct / b[1].attempts : 0;
            return bAcc - aAcc;
          })[0]?.[0]
      : null;
  const focusSkill =
    skillEntries.length > 0
      ? [...skillEntries]
          .sort((a, b) => {
            const aAcc = a[1].attempts > 0 ? a[1].correct / a[1].attempts : 0;
            const bAcc = b[1].attempts > 0 ? b[1].correct / b[1].attempts : 0;
            return aAcc - bAcc;
          })[0]?.[0]
      : null;

  if (status) {
    return (
      <section className="rounded-2xl bg-white/85 p-4">
        <p className="text-sm font-semibold text-ink/80">{status}</p>
        {children.length === 0 && (
          <button className="mt-3 rounded-xl bg-leaf px-3 py-2 text-sm font-semibold text-white" onClick={() => router.push("/profiles")}>
            Go to Profiles
          </button>
        )}
      </section>
    );
  }

  if (!activeChild) return null;

  const questProgress = dailyQuest?.progressPercent ?? 0;
  const questMainTarget = 2;

  if (currentStep === "recap") {
    return (
      <section className="space-y-4">
        {dailyQuest && (
          <article className="rounded-2xl bg-white/90 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-leaf">Daily Quest</p>
              <p className="text-xs font-semibold text-ink/70">
                {dailyQuest.roundsToday}/{dailyQuest.dailyGoal} rounds
              </p>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-gradient-to-r from-leaf to-emerald-400" style={{ width: `${questProgress}%` }} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-semibold">
              <div className={`rounded-xl px-2 py-2 ${dailyQuest.completed.warmup ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-600"}`}>
                Warmup
              </div>
              <div
                className={`rounded-xl px-2 py-2 ${
                  dailyQuest.completed.mainCount >= questMainTarget ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-600"
                }`}
              >
                Main {Math.min(dailyQuest.completed.mainCount, questMainTarget)}/{questMainTarget}
              </div>
              <div className={`rounded-xl px-2 py-2 ${dailyQuest.completed.boss ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-600"}`}>
                Boss
              </div>
            </div>
          </article>
        )}

        <article className="rounded-3xl bg-white/90 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-leaf">Session Recap</p>
          <h2 className="mt-2 text-2xl font-black text-ink">Great session, {activeChild.name}</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 text-center">
            <div className="rounded-2xl bg-mint p-3">
              <p className="text-xs font-semibold uppercase text-ink/70">Rounds</p>
              <p className="text-2xl font-black text-leaf">{stats.rounds}</p>
            </div>
            <div className="rounded-2xl bg-mint p-3">
              <p className="text-xs font-semibold uppercase text-ink/70">Correct</p>
              <p className="text-2xl font-black text-leaf">{stats.correct}</p>
            </div>
            <div className="rounded-2xl bg-clay p-3">
              <p className="text-xs font-semibold uppercase text-ink/70">XP</p>
              <p className="text-2xl font-black text-ink">{stats.xp}</p>
            </div>
            <div className="rounded-2xl bg-clay p-3">
              <p className="text-xs font-semibold uppercase text-ink/70">Strategy XP</p>
              <p className="text-2xl font-black text-ink">{stats.strategyXp}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-center">
            <div className="rounded-2xl bg-mint p-3">
              <p className="text-xs font-semibold uppercase text-ink/70">Session Accuracy</p>
              <p className="text-2xl font-black text-leaf">{sessionAccuracy}%</p>
            </div>
            <div className="rounded-2xl bg-mint p-3">
              <p className="text-xs font-semibold uppercase text-ink/70">First-Try</p>
              <p className="text-2xl font-black text-leaf">{sessionFirstTryRate}%</p>
            </div>
            <div className="rounded-2xl bg-clay p-3">
              <p className="text-xs font-semibold uppercase text-ink/70">Recoveries</p>
              <p className="text-2xl font-black text-ink">{stats.recoveries}</p>
            </div>
            <div className="rounded-2xl bg-clay p-3">
              <p className="text-xs font-semibold uppercase text-ink/70">Streak</p>
              <p className="text-2xl font-black text-ink">{stats.streak}</p>
            </div>
          </div>

          {(strongestSkill || focusSkill) && (
            <div className="mt-4 rounded-2xl bg-indigo-50 p-3 text-sm font-semibold text-indigo-900">
              {strongestSkill && <p>Strongest today: {SKILL_LABELS[strongestSkill]}</p>}
              {focusSkill && <p>Focus next: {SKILL_LABELS[focusSkill]}</p>}
            </div>
          )}

          {stats.levelUps.length > 0 && (
            <div className="mt-4 rounded-2xl bg-emerald-100 p-3 text-sm font-semibold text-emerald-900 animate-level-pop">
              {stats.levelUps.map((item) => `${SKILL_LABELS[item.skill]} L${item.level}`).join(" · ")}
            </div>
          )}

          {stats.badges.length > 0 && (
            <div className="mt-3 rounded-2xl bg-amber-100 p-3 text-sm font-semibold text-amber-900 animate-badge-pop">
              Badges unlocked: {stats.badges.map((badge) => badge.replaceAll("_", " ")).join(" · ")}
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button onClick={startNewSession} className="flex-1 rounded-xl bg-leaf px-4 py-2 text-sm font-semibold text-white">
              Start New Session
            </button>
            <button
              onClick={() => router.push(`/progress?child=${activeChild.id}`)}
              className="flex-1 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white"
            >
              View Progress
            </button>
          </div>
        </article>
      </section>
    );
  }

  if (!round) return null;

  const content = round.activity.content as {
    prompt?: string;
    question?: string;
    correctIndex?: number;
    correctChoiceIndex?: number;
    choices: string[];
    explanation: string;
    tip: string;
    story?: string;
    image?: string;
    debrief?: string;
  };
  const promptText = content.prompt ?? content.question ?? "Pick the best answer.";
  const displayChoices =
    choiceOrder.length > 0
      ? choiceOrder
      : content.choices.map((label, originalIndex) => ({ label, originalIndex }));

  return (
    <section className="space-y-4">
      {dailyQuest && (
        <article className="rounded-2xl bg-white/90 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-leaf">Daily Quest</p>
            <p className="text-xs font-semibold text-ink/70">
              {dailyQuest.roundsToday}/{dailyQuest.dailyGoal} rounds today
            </p>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-gradient-to-r from-leaf to-emerald-400 transition-all duration-700" style={{ width: `${questProgress}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
            <span className={`rounded-full px-2 py-1 ${dailyQuest.completed.warmup ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-600"}`}>
              Warmup
            </span>
            <span
              className={`rounded-full px-2 py-1 ${
                dailyQuest.completed.mainCount >= questMainTarget ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-600"
              }`}
            >
              Main {Math.min(dailyQuest.completed.mainCount, questMainTarget)}/{questMainTarget}
            </span>
            <span className={`rounded-full px-2 py-1 ${dailyQuest.completed.boss ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-600"}`}>
              Boss
            </span>
            {dailyQuest.dueReviews > 0 && <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-900">Due reviews {dailyQuest.dueReviews}</span>}
          </div>
        </article>
      )}

      <article className="rounded-3xl bg-white/90 p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-ink px-3 py-1 text-xs font-bold text-white">{String(currentStep).toUpperCase()}</span>
          <span className="rounded-full bg-mint px-3 py-1 text-xs font-bold text-ink">{round.plan.mode.toUpperCase()}</span>
          <span className="rounded-full bg-clay px-3 py-1 text-xs font-bold text-ink">{SKILL_LABELS[round.plan.skill]}</span>
        </div>

        <h2 className={`${isYoung ? "text-2xl" : "text-xl"} mt-3 font-black text-ink`}>{round.activity.title}</h2>

        {content.image && (
          <img
            src={content.image}
            alt={round.activity.title}
            className={`mt-3 w-full rounded-2xl border border-leaf/20 object-cover ${currentStep === "boss" ? "h-52" : "h-44"}`}
          />
        )}

        {content.story && (
          <p className={`${isYoung ? "text-base leading-7" : "text-sm leading-6"} mt-3 rounded-2xl bg-mint p-3 text-ink/90`}>
            {content.story}
          </p>
        )}

        <p className={`${isYoung ? "text-xl leading-8" : "text-base"} mt-3 font-semibold text-ink/90`}>{promptText}</p>

        <div className="mt-4 grid gap-3">
          {displayChoices.map((item) => (
            <button
              key={`${item.label}-${item.originalIndex}`}
              onClick={() => setChoice(item.originalIndex)}
              disabled={roundFinalized}
              className={`rounded-2xl border px-4 py-3 text-left font-semibold transition ${
                choice === item.originalIndex
                  ? "border-leaf bg-leaf text-white"
                  : "border-leaf/20 bg-mint text-ink hover:border-leaf/40"
              } ${isYoung ? "text-lg" : "text-sm"} disabled:opacity-70`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {!roundFinalized && (
          <button
            onClick={handleSubmit}
            disabled={choice === null}
            className="mt-5 w-full rounded-xl bg-ink px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {attemptNumber === 1 ? "Check Answer" : "Retry Answer"}
          </button>
        )}
      </article>

      {feedback && (
        <article className={`rounded-2xl p-4 ${roundFinalized ? "bg-clay" : "bg-amber-50"}`}>
          <h3 className="text-lg font-black text-ink">{feedback.title}</h3>
          <p className="mt-2 text-sm text-ink/90">{feedback.message}</p>
          {feedback.hint && (
            <p className="mt-2 rounded-xl bg-white/70 px-3 py-2 text-sm font-semibold text-ink/90">{feedback.hint}</p>
          )}
          <p className="mt-2 text-sm font-semibold text-ink">Strategy tip: {feedback.tip}</p>
          {feedback.celebrate && <p className="mt-2 text-sm font-semibold text-leaf">{feedback.celebrate}</p>}
          {content.debrief && (
            <p className="mt-2 rounded-xl bg-white/70 px-3 py-2 text-sm text-ink/90">Debrief: {content.debrief}</p>
          )}

          {roundFinalized && (
            <button onClick={advance} className="mt-3 rounded-xl bg-leaf px-4 py-2 text-sm font-semibold text-white">
              {sessionIndex < sessionPhases.length - 1 ? "Next Stage" : "See Recap"}
            </button>
          )}
        </article>
      )}

      {celebration && (
        <article className="rounded-2xl bg-emerald-100 p-3 text-sm font-semibold text-emerald-900 animate-level-pop">
          {celebration}
        </article>
      )}
    </section>
  );
}
