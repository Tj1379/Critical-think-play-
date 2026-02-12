import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { badgeKeysForMilestones, updateMasteryState } from "@/lib/mastery";
import { CT_SKILLS, SKILL_DESCRIPTIONS, SKILL_LABELS, difficultyToLevel, normalizeSkill, type CtSkill } from "@/lib/skills";
import {
  chooseNextItem,
  computeNextReview,
  type AttemptSummary,
  type NextItemPlan,
  type SkillState
} from "@/lib/scheduler";
import type {
  Activity,
  Attempt,
  ChildAdaptiveSettings,
  ChildBadge,
  ChildProfile,
  ChildSkillState,
  ReviewQueueItem,
  SessionMode
} from "@/types/domain";

export type SessionStep = "warmup" | "main" | "boss";

export type AdaptiveRound = {
  activity: Activity;
  plan: NextItemPlan;
};

export type DailyQuestState = {
  childId: string;
  date: string;
  roundsToday: number;
  dailyGoal: number;
  progressPercent: number;
  dueReviews: number;
  weakestSkills: CtSkill[];
  completed: {
    warmup: boolean;
    mainCount: number;
    boss: boolean;
  };
  remainingSteps: SessionStep[];
  isComplete: boolean;
};

export type WeeklyReport = {
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

export const DEFAULT_ADAPTIVE_SETTINGS = {
  main_rounds: 1,
  boss_enabled: true,
  boss_intensity: 3,
  hint_mode: "guided",
  daily_goal: 3
} as const;

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const message = String((error as { message?: string }).message ?? "").toLowerCase();
  return message.includes("does not exist") || message.includes("could not find the table");
}

function toSkillState(rows: ChildSkillState[]): SkillState[] {
  return rows.map((row) => ({
    skill: row.skill,
    level: row.level,
    masteryScore: row.mastery_score
  }));
}

function randomPick<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  const index = Math.floor(Math.random() * items.length);
  return items[index] ?? null;
}

function normalizeActivitySkill(activity: Activity): CtSkill {
  if (activity.content.ct_skill) return activity.content.ct_skill;
  return normalizeSkill(activity.skill);
}

function isPlaceholderChoice(choice: string): boolean {
  const normalized = String(choice).trim().toLowerCase();
  if (!normalized) return true;

  const blocked = [
    "red blue red blue next car",
    "red blue red blue next sleep",
    "option a for",
    "option b for",
    "option c for",
    "option d for"
  ];

  return blocked.some((token) => normalized.includes(token));
}

function isPlayableActivity(activity: Activity): boolean {
  const content = (activity.content ?? {}) as {
    prompt?: string;
    question?: string;
    choices?: unknown;
    correctIndex?: number;
    correctChoiceIndex?: number;
  };

  const prompt = content.prompt ?? content.question;
  const choices = Array.isArray(content.choices) ? content.choices : [];
  const correctIndex = Number.isInteger(content.correctIndex)
    ? Number(content.correctIndex)
    : Number.isInteger(content.correctChoiceIndex)
      ? Number(content.correctChoiceIndex)
      : -1;

  if (!prompt || choices.length < 2) return false;
  if (correctIndex < 0 || correctIndex >= choices.length) return false;

  for (const choice of choices) {
    if (typeof choice !== "string") return false;
    if (isPlaceholderChoice(choice)) return false;
  }

  return true;
}

function buildDifficultyDistance(activity: Activity, targetDifficulty: number): number {
  return Math.abs(difficultyToLevel(activity.difficulty) - targetDifficulty);
}

function getDayRange(date: Date): { startIso: string; endIso: string; key: string } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const key = start.toISOString().slice(0, 10);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    key
  };
}

function getAttemptMeta(
  answer: unknown,
  activitySkillMap: Map<string, CtSkill>,
  activityId: string
): {
  attemptNumber: 1 | 2;
  sessionMode: SessionMode;
  skill: CtSkill;
} {
  const parsed = (answer ?? {}) as {
    attemptNumber?: number;
    sessionMode?: string;
    skill?: string;
  };
  const attemptNumber = parsed.attemptNumber === 2 ? 2 : 1;
  const mode = parsed.sessionMode;
  const sessionMode: SessionMode =
    mode === "warmup" || mode === "main" || mode === "boss" || mode === "review" ? mode : "main";
  const skill = parsed.skill ? normalizeSkill(parsed.skill) : activitySkillMap.get(activityId) ?? "interpret";

  return {
    attemptNumber,
    sessionMode,
    skill
  };
}

function weekRangeDays(now: Date): Array<{ key: string; startIso: string; endIso: string }> {
  const days: Array<{ key: string; startIso: string; endIso: string }> = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date(now);
    day.setDate(now.getDate() - offset);
    days.push(getDayRange(day));
  }
  return days;
}

async function ensureSkillRows(childId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient() as any;
  const { data, error } = await supabase.from("child_skill_state").select("skill").eq("child_id", childId);
  if (error) throw error;

  const existing = new Set((data ?? []).map((row: { skill: CtSkill }) => row.skill));
  const missing = CT_SKILLS.filter((skill) => !existing.has(skill));

  if (missing.length === 0) return;

  const inserts = missing.map((skill) => ({
    child_id: childId,
    skill,
    level: 1,
    xp: 0,
    mastery_score: 0
  }));

  const { error: insertError } = await supabase.from("child_skill_state").insert(inserts);
  if (insertError) throw insertError;
}

async function updateDailyStreak(childId: string): Promise<number> {
  const supabase = getSupabaseBrowserClient() as any;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: streakRow, error: streakFetchError } = await supabase
    .from("streaks")
    .select("*")
    .eq("child_id", childId)
    .maybeSingle();

  if (streakFetchError) throw streakFetchError;

  const existing = streakRow as { current_streak: number; last_played_date: string } | null;

  let currentStreak = 1;
  if (existing) {
    if (existing.last_played_date === today) {
      currentStreak = existing.current_streak;
    } else if (existing.last_played_date === yesterday) {
      currentStreak = existing.current_streak + 1;
    }
  }

  const { error: streakUpsertError } = await supabase.from("streaks").upsert({
    child_id: childId,
    current_streak: currentStreak,
    last_played_date: today
  });

  if (streakUpsertError) throw streakUpsertError;
  return currentStreak;
}

async function dueReviewSummary(childId: string): Promise<{
  dueReviewCount: number;
  dueReviewBySkill: Partial<Record<CtSkill, number>>;
}> {
  const supabase = getSupabaseBrowserClient() as any;
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("review_queue")
    .select("skill")
    .eq("child_id", childId)
    .lte("due_at", nowIso);

  if (error && !isMissingRelationError(error)) throw error;
  if (error && isMissingRelationError(error)) {
    return {
      dueReviewCount: 0,
      dueReviewBySkill: {}
    };
  }

  const dueReviewBySkill: Partial<Record<CtSkill, number>> = {};
  (data ?? []).forEach((row: { skill: CtSkill }) => {
    dueReviewBySkill[row.skill] = (dueReviewBySkill[row.skill] ?? 0) + 1;
  });

  return {
    dueReviewCount: (data ?? []).length,
    dueReviewBySkill
  };
}

async function recentAttemptSummaries(childId: string): Promise<AttemptSummary[]> {
  const supabase = getSupabaseBrowserClient() as any;
  const { data, error } = await supabase
    .from("attempts")
    .select("activity_id,is_correct,created_at,answer")
    .eq("child_id", childId)
    .order("created_at", { ascending: false })
    .limit(24);

  if (error) throw error;

  const attempts = (data ?? []) as Array<{
    activity_id: string;
    is_correct: boolean;
    created_at: string;
    answer: { responseTimeMs?: number; skill?: CtSkill } | null;
  }>;

  if (attempts.length === 0) return [];

  const ids = attempts.map((item) => item.activity_id);
  const { data: activityRows } = await supabase.from("activities").select("id,skill,content").in("id", ids);

  const skillMap = new Map<string, CtSkill>();
  (activityRows ?? []).forEach((row: { id: string; skill: string; content?: { ct_skill?: CtSkill } }) => {
    const contentSkill = row.content?.ct_skill;
    skillMap.set(row.id, contentSkill ?? normalizeSkill(row.skill));
  });

  return attempts
    .map((attempt) => ({
      skill: attempt.answer?.skill ?? skillMap.get(attempt.activity_id) ?? "interpret",
      isCorrect: attempt.is_correct,
      createdAt: attempt.created_at,
      responseTimeMs: attempt.answer?.responseTimeMs
    }))
    .reverse();
}

async function getDueReviewActivities(childId: string, skill: CtSkill, excludeIds: string[]): Promise<Activity[]> {
  const supabase = getSupabaseBrowserClient() as any;
  const nowIso = new Date().toISOString();

  const { data: queueRows, error: queueError } = await supabase
    .from("review_queue")
    .select("*")
    .eq("child_id", childId)
    .eq("skill", skill)
    .lte("due_at", nowIso)
    .order("due_at", { ascending: true })
    .limit(16);

  if (queueError && !isMissingRelationError(queueError)) throw queueError;
  if (queueError && isMissingRelationError(queueError)) return [];

  const queue = (queueRows ?? []) as ReviewQueueItem[];
  if (queue.length === 0) return [];

  const ids = queue.map((item) => item.activity_id).filter((id) => !excludeIds.includes(id));
  if (ids.length === 0) return [];

  const { data: activities, error: activityError } = await supabase.from("activities").select("*").in("id", ids);
  if (activityError) throw activityError;

  const byId = new Map((activities ?? []).map((item: Activity) => [item.id, item]));
  return ids.map((id) => byId.get(id)).filter((item): item is Activity => Boolean(item));
}

function selectFromNewPool(params: {
  activities: Activity[];
  skill: CtSkill;
  targetDifficulty: number;
  excludeIds: string[];
}): Activity | null {
  const withoutExcluded = params.activities.filter((activity) => !params.excludeIds.includes(activity.id));
  const matchingSkill = withoutExcluded.filter((activity) => normalizeActivitySkill(activity) === params.skill);

  const pool = matchingSkill.length > 0 ? matchingSkill : withoutExcluded;
  if (pool.length === 0) return null;

  const ranked = [...pool].sort((a, b) => {
    const aDistance = buildDifficultyDistance(a, params.targetDifficulty);
    const bDistance = buildDifficultyDistance(b, params.targetDifficulty);
    return aDistance - bDistance;
  });

  const candidates = ranked.slice(0, Math.min(8, ranked.length));
  return randomPick(candidates);
}

export async function listChildrenForCurrentParent(): Promise<ChildProfile[]> {
  const supabase = getSupabaseBrowserClient() as any;
  const { data, error } = await supabase.from("child_profiles").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return data as ChildProfile[];
}

export async function createChildProfile(input: Pick<ChildProfile, "name" | "age_band" | "reading_level">) {
  const supabase = getSupabaseBrowserClient() as any;
  const { data, error } = await supabase
    .from("child_profiles")
    .insert({ ...input })
    .select("*")
    .single();
  if (error) throw error;
  return data as ChildProfile;
}

export async function updateChildProfile(id: string, input: Partial<Pick<ChildProfile, "name" | "age_band" | "reading_level">>) {
  const supabase = getSupabaseBrowserClient() as any;
  const { error } = await supabase.from("child_profiles").update(input).eq("id", id);
  if (error) throw error;
}

export async function deleteChildProfile(id: string) {
  const supabase = getSupabaseBrowserClient() as any;
  const { error } = await supabase.from("child_profiles").delete().eq("id", id);
  if (error) throw error;
}

export async function getChildAdaptiveSettings(childId: string): Promise<ChildAdaptiveSettings> {
  const supabase = getSupabaseBrowserClient() as any;

  const { data, error } = await supabase.from("child_adaptive_settings").select("*").eq("child_id", childId).maybeSingle();

  if (error && !isMissingRelationError(error)) throw error;
  if (error && isMissingRelationError(error)) {
    return {
      child_id: childId,
      ...DEFAULT_ADAPTIVE_SETTINGS,
      updated_at: new Date().toISOString()
    };
  }

  if (!data) {
    const insertPayload = {
      child_id: childId,
      ...DEFAULT_ADAPTIVE_SETTINGS,
      updated_at: new Date().toISOString()
    };
    const { data: inserted, error: insertError } = await supabase
      .from("child_adaptive_settings")
      .upsert(insertPayload)
      .select("*")
      .maybeSingle();

    if (insertError && !isMissingRelationError(insertError)) throw insertError;
    if (insertError && isMissingRelationError(insertError)) {
      return {
        child_id: childId,
        ...DEFAULT_ADAPTIVE_SETTINGS,
        updated_at: new Date().toISOString()
      };
    }

    return (inserted ?? insertPayload) as ChildAdaptiveSettings;
  }

  return data as ChildAdaptiveSettings;
}

export async function updateChildAdaptiveSettings(
  childId: string,
  input: Partial<Pick<ChildAdaptiveSettings, "main_rounds" | "boss_enabled" | "boss_intensity" | "hint_mode" | "daily_goal">>
): Promise<ChildAdaptiveSettings> {
  const supabase = getSupabaseBrowserClient() as any;

  const payload = {
    child_id: childId,
    ...DEFAULT_ADAPTIVE_SETTINGS,
    ...input,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase.from("child_adaptive_settings").upsert(payload).select("*").single();

  if (error && !isMissingRelationError(error)) throw error;
  if (error && isMissingRelationError(error)) {
    return payload as ChildAdaptiveSettings;
  }

  return data as ChildAdaptiveSettings;
}

export async function getDailyQuestState(
  childId: string,
  adaptiveSettings?: Partial<Pick<ChildAdaptiveSettings, "daily_goal" | "boss_enabled">>
): Promise<DailyQuestState> {
  const supabase = getSupabaseBrowserClient() as any;
  const todayRange = getDayRange(new Date());

  const [review, skillRowsRes, attemptsRes] = await Promise.all([
    dueReviewSummary(childId),
    getChildSkillStates(childId),
    supabase
      .from("attempts")
      .select("activity_id,created_at,answer,is_correct")
      .eq("child_id", childId)
      .gte("created_at", todayRange.startIso)
      .lt("created_at", todayRange.endIso)
      .order("created_at", { ascending: true })
  ]);

  const attemptsError = attemptsRes.error as unknown;
  if (attemptsError && !isMissingRelationError(attemptsError)) throw attemptsError;

  const attempts = (attemptsRes.data ?? []) as Array<{
    activity_id: string;
    created_at: string;
    is_correct: boolean;
    answer: unknown;
  }>;

  const activityIds = Array.from(new Set(attempts.map((item) => item.activity_id)));
  const { data: activityRows, error: activityError } =
    activityIds.length > 0
      ? await supabase.from("activities").select("id,skill,content").in("id", activityIds)
      : { data: [], error: null };

  if (activityError) throw activityError;

  const activitySkillMap = new Map<string, CtSkill>();
  (activityRows ?? []).forEach((row: { id: string; skill: string; content?: { ct_skill?: CtSkill } }) => {
    activitySkillMap.set(row.id, row.content?.ct_skill ?? normalizeSkill(row.skill));
  });

  const firstAttempts = attempts.filter((attempt) => {
    const meta = getAttemptMeta(attempt.answer, activitySkillMap, attempt.activity_id);
    return meta.attemptNumber === 1;
  });

  let warmupDone = false;
  let mainCount = 0;
  let bossDone = false;

  firstAttempts.forEach((attempt) => {
    const meta = getAttemptMeta(attempt.answer, activitySkillMap, attempt.activity_id);
    if (meta.sessionMode === "warmup") warmupDone = true;
    if (meta.sessionMode === "main" || meta.sessionMode === "review") mainCount += 1;
    if (meta.sessionMode === "boss") bossDone = true;
  });

  const weakestSkills = [...skillRowsRes]
    .sort((a, b) => a.mastery_score - b.mastery_score)
    .slice(0, 2)
    .map((row) => row.skill);

  const remainingSteps: SessionStep[] = [];
  if (!warmupDone) remainingSteps.push("warmup");
  const remainingMain = Math.max(0, 2 - mainCount);
  for (let i = 0; i < remainingMain; i += 1) remainingSteps.push("main");
  if ((adaptiveSettings?.boss_enabled ?? true) && !bossDone) remainingSteps.push("boss");

  const dailyGoal = Math.max(1, Math.min(10, adaptiveSettings?.daily_goal ?? DEFAULT_ADAPTIVE_SETTINGS.daily_goal));
  const roundsToday = firstAttempts.length;
  const progressPercent = Math.min(100, Math.round((Math.min(roundsToday, dailyGoal) / dailyGoal) * 100));

  return {
    childId,
    date: todayRange.key,
    roundsToday,
    dailyGoal,
    progressPercent,
    dueReviews: review.dueReviewCount,
    weakestSkills,
    completed: {
      warmup: warmupDone,
      mainCount,
      boss: bossDone
    },
    remainingSteps,
    isComplete: remainingSteps.length === 0
  };
}

export async function getActivityForAgeBand(ageBand: string, excludeActivityId?: string): Promise<Activity | null> {
  const supabase = getSupabaseBrowserClient() as any;
  const { data, error } = await supabase.from("activities").select("*").eq("age_band", ageBand);
  if (error) throw error;

  const activities = ((data ?? []) as Activity[]).filter(isPlayableActivity);
  if (activities.length === 0) return null;

  const pool = excludeActivityId && activities.length > 1 ? activities.filter((item) => item.id !== excludeActivityId) : activities;
  return randomPick(pool);
}

export async function getChildSkillStates(childId: string): Promise<ChildSkillState[]> {
  try {
    await ensureSkillRows(childId);
  } catch (error) {
    if (!isMissingRelationError(error)) throw error;
    return CT_SKILLS.map((skill) => ({
      child_id: childId,
      skill,
      level: 1,
      xp: 0,
      mastery_score: 0,
      updated_at: new Date().toISOString()
    }));
  }
  const supabase = getSupabaseBrowserClient() as any;
  const { data, error } = await supabase
    .from("child_skill_state")
    .select("*")
    .eq("child_id", childId)
    .order("skill", { ascending: true });

  if (error && !isMissingRelationError(error)) throw error;
  if (error && isMissingRelationError(error)) {
    return CT_SKILLS.map((skill) => ({
      child_id: childId,
      skill,
      level: 1,
      xp: 0,
      mastery_score: 0,
      updated_at: new Date().toISOString()
    }));
  }
  return (data ?? []) as ChildSkillState[];
}

export async function getNextAdaptiveRound(params: {
  childId: string;
  ageBand: string;
  sessionStep: SessionStep;
  excludeActivityIds?: string[];
  adaptiveSettings?: Partial<Pick<ChildAdaptiveSettings, "boss_intensity">>;
}): Promise<AdaptiveRound | null> {
  const supabase = getSupabaseBrowserClient() as any;
  const excludeIds = params.excludeActivityIds ?? [];

  try {
    const [skillRows, reviewSummary, recentAttempts, activityRows] = await Promise.all([
      getChildSkillStates(params.childId),
      dueReviewSummary(params.childId),
      recentAttemptSummaries(params.childId),
      supabase.from("activities").select("*").eq("age_band", params.ageBand)
    ]);

    const activities = ((activityRows.data ?? []) as Activity[]).filter(isPlayableActivity);
    if (activityRows.error) throw activityRows.error;

    if (activities.length === 0) {
      return null;
    }

    const plan = chooseNextItem({
      now: new Date(),
      dueReviewCount: reviewSummary.dueReviewCount,
      dueReviewBySkill: reviewSummary.dueReviewBySkill,
      skillStates: toSkillState(skillRows),
      recentAttempts,
      sessionStep: params.sessionStep
    });

    // Boss intensity shifts challenge around the recommended difficulty.
    const bossIntensity = params.adaptiveSettings?.boss_intensity ?? 3;
    const bossOffset = Math.round((bossIntensity - 3) / 2);
    const tunedPlan: NextItemPlan =
      plan.mode === "boss"
        ? { ...plan, targetDifficulty: Math.max(1, Math.min(5, plan.targetDifficulty + bossOffset)) }
        : plan;

    let activity: Activity | null = null;

    if (tunedPlan.source === "review_queue") {
      const dueActivities = await getDueReviewActivities(params.childId, tunedPlan.skill, excludeIds);
      activity = randomPick(dueActivities);
    }

    if (!activity) {
      activity = selectFromNewPool({
        activities,
        skill: tunedPlan.skill,
        targetDifficulty: tunedPlan.targetDifficulty,
        excludeIds
      });
    }

    if (!activity) {
      activity = randomPick(activities);
    }

    if (!activity) return null;

    return {
      activity,
      plan: tunedPlan
    };
  } catch (error) {
    if (!isMissingRelationError(error)) throw error;

    const { data: activityRows, error: activityError } = await supabase.from("activities").select("*").eq("age_band", params.ageBand);
    if (activityError) throw activityError;
    const activities = ((activityRows ?? []) as Activity[]).filter(isPlayableActivity);
    const fallback = randomPick(activities.filter((activity) => !excludeIds.includes(activity.id))) ?? randomPick(activities);
    if (!fallback) return null;

    return {
      activity: fallback,
      plan: {
        mode: params.sessionStep,
        skill: normalizeActivitySkill(fallback),
        targetDifficulty: difficultyToLevel(fallback.difficulty),
        source: "new_pool"
      }
    };
  }
}

export async function logAttemptResponse(params: {
  childId: string;
  activityId: string;
  choiceIndex: number;
  isCorrect: boolean;
  attemptNumber: 1 | 2;
  responseTimeMs: number;
  sessionMode: SessionMode;
  skill: CtSkill;
  usedHint: boolean;
}): Promise<Attempt> {
  const supabase = getSupabaseBrowserClient() as any;

  const { data, error } = await supabase
    .from("attempts")
    .insert({
      child_id: params.childId,
      activity_id: params.activityId,
      is_correct: params.isCorrect,
      score: params.isCorrect ? 1 : 0,
      answer: {
        choiceIndex: params.choiceIndex,
        attemptNumber: params.attemptNumber,
        responseTimeMs: params.responseTimeMs,
        sessionMode: params.sessionMode,
        skill: params.skill,
        usedHint: params.usedHint
      }
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as Attempt;
}

export async function finalizeAdaptiveRound(params: {
  childId: string;
  activity: Activity;
  plan: NextItemPlan;
  finalCorrect: boolean;
  attemptNumber: 1 | 2;
  usedHint: boolean;
}): Promise<{
  xpAwarded: number;
  strategyXp: number;
  newLevel: number;
  newMasteryScore: number;
  leveledUp: boolean;
  streak: number;
  newBadges: string[];
}> {
  const supabase = getSupabaseBrowserClient() as any;
  try {
    await ensureSkillRows(params.childId);

    const { data: currentStateRow, error: stateError } = await supabase
      .from("child_skill_state")
      .select("*")
      .eq("child_id", params.childId)
      .eq("skill", params.plan.skill)
      .single();

    if (stateError) throw stateError;

    const currentState = currentStateRow as ChildSkillState;

    const masteryUpdate = updateMasteryState({
      currentLevel: currentState.level,
      currentXp: currentState.xp,
      currentMasteryScore: currentState.mastery_score,
      isCorrect: params.finalCorrect,
      attemptNumber: params.attemptNumber,
      usedHint: params.usedHint,
      mode: params.plan.mode
    });

    const { error: upsertStateError } = await supabase.from("child_skill_state").upsert({
      child_id: params.childId,
      skill: params.plan.skill,
      level: masteryUpdate.newLevel,
      xp: masteryUpdate.newXp,
      mastery_score: masteryUpdate.newMasteryScore,
      updated_at: new Date().toISOString()
    });

    if (upsertStateError) throw upsertStateError;

    const { data: existingReviewRow } = await supabase
      .from("review_queue")
      .select("interval_days,ease")
      .eq("child_id", params.childId)
      .eq("activity_id", params.activity.id)
      .maybeSingle();

    const reviewUpdate = computeNextReview({
      now: new Date(),
      wasCorrect: params.finalCorrect,
      previousIntervalDays: (existingReviewRow as { interval_days: number } | null)?.interval_days,
      previousEase: (existingReviewRow as { ease: number } | null)?.ease,
      attemptNumber: params.attemptNumber
    });

    const { error: reviewUpsertError } = await supabase.from("review_queue").upsert({
      child_id: params.childId,
      activity_id: params.activity.id,
      skill: params.plan.skill,
      due_at: reviewUpdate.dueAtIso,
      interval_days: reviewUpdate.intervalDays,
      ease: reviewUpdate.ease,
      last_result: params.finalCorrect,
      created_at: new Date().toISOString()
    });

    if (reviewUpsertError) throw reviewUpsertError;

    const streak = await updateDailyStreak(params.childId);

    const computedBadges = badgeKeysForMilestones({
      skill: params.plan.skill,
      newLevel: masteryUpdate.newLevel,
      isBoss: params.plan.mode === "boss",
      isCorrect: params.finalCorrect,
      solvedOnRetry: params.finalCorrect && params.attemptNumber === 2
    });

    if (params.plan.mode === "boss" && params.finalCorrect) {
      computedBadges.push(`boss_daily_${new Date().toISOString().slice(0, 10)}`);
    }

    if (streak >= 3) computedBadges.push("streak_3");
    if (streak >= 7) computedBadges.push("streak_7");
    if (streak >= 14) computedBadges.push("streak_14");

    const candidateBadges = [...new Set(computedBadges)];
    let newBadges: string[] = [];

    if (candidateBadges.length > 0) {
      const { data: existingBadges, error: badgeFetchError } = await supabase
        .from("child_badges")
        .select("badge_key")
        .eq("child_id", params.childId)
        .in("badge_key", candidateBadges);

      if (badgeFetchError) throw badgeFetchError;

      const already = new Set((existingBadges ?? []).map((row: { badge_key: string }) => row.badge_key));
      newBadges = candidateBadges.filter((badge) => !already.has(badge));

      if (newBadges.length > 0) {
        const { error: badgeInsertError } = await supabase.from("child_badges").insert(
          newBadges.map((badge) => ({
            child_id: params.childId,
            badge_key: badge
          }))
        );

        if (badgeInsertError) throw badgeInsertError;
      }
    }

    return {
      xpAwarded: masteryUpdate.xpAwarded,
      strategyXp: masteryUpdate.strategyXp,
      newLevel: masteryUpdate.newLevel,
      newMasteryScore: masteryUpdate.newMasteryScore,
      leveledUp: masteryUpdate.leveledUp,
      streak,
      newBadges
    };
  } catch (error) {
    if (!isMissingRelationError(error)) throw error;

    const fallback = updateMasteryState({
      currentLevel: 1,
      currentXp: 0,
      currentMasteryScore: 0,
      isCorrect: params.finalCorrect,
      attemptNumber: params.attemptNumber,
      usedHint: params.usedHint,
      mode: params.plan.mode
    });

    const streak = await updateDailyStreak(params.childId);

    return {
      xpAwarded: fallback.xpAwarded,
      strategyXp: fallback.strategyXp,
      newLevel: fallback.newLevel,
      newMasteryScore: fallback.newMasteryScore,
      leveledUp: false,
      streak,
      newBadges: []
    };
  }
}

export async function getChildSkillTree(childId: string): Promise<{
  tracks: Array<{
    skill: CtSkill;
    label: string;
    description: string;
    level: number;
    masteryScore: number;
    xp: number;
    dueReviews: number;
    xpToNext: number;
  }>;
  totalXp: number;
}> {
  let skillRows: ChildSkillState[] = [];
  let dueSummary: { dueReviewCount: number; dueReviewBySkill: Partial<Record<CtSkill, number>> } = {
    dueReviewCount: 0,
    dueReviewBySkill: {}
  };

  try {
    [skillRows, dueSummary] = await Promise.all([getChildSkillStates(childId), dueReviewSummary(childId)]);
  } catch (error) {
    if (!isMissingRelationError(error)) throw error;
    skillRows = CT_SKILLS.map((skill) => ({
      child_id: childId,
      skill,
      level: 1,
      xp: 0,
      mastery_score: 0,
      updated_at: new Date().toISOString()
    }));
  }

  const tracks = skillRows.map((row) => {
    const nextRequirement = row.level >= 5 ? row.xp : (row.level === 1 ? 80 : row.level === 2 ? 200 : row.level === 3 ? 360 : 560);
    return {
      skill: row.skill,
      label: SKILL_LABELS[row.skill],
      description: SKILL_DESCRIPTIONS[row.skill],
      level: row.level,
      masteryScore: row.mastery_score,
      xp: row.xp,
      dueReviews: dueSummary.dueReviewBySkill[row.skill] ?? 0,
      xpToNext: row.level >= 5 ? 0 : Math.max(0, nextRequirement - row.xp)
    };
  });

  return {
    tracks,
    totalXp: tracks.reduce((sum, track) => sum + track.xp, 0)
  };
}

export async function getChildProgress(childId: string) {
  const supabase = getSupabaseBrowserClient() as any;
  const [{ data: attempts, error: attemptError }, { data: streak, error: streakError }] = await Promise.all([
    supabase.from("attempts").select("activity_id,is_correct,score,created_at,answer").eq("child_id", childId).order("created_at", { ascending: true }),
    supabase.from("streaks").select("current_streak,last_played_date").eq("child_id", childId).maybeSingle()
  ]);

  if (attemptError) throw attemptError;
  if (streakError) throw streakError;

  let badges: Array<{ badge_key: string; earned_at: string }> = [];
  let skillStates: ChildSkillState[] = [];

  const { data: badgeRows, error: badgeError } = await supabase
    .from("child_badges")
    .select("badge_key,earned_at")
    .eq("child_id", childId)
    .order("earned_at", { ascending: false });

  if (badgeError && !isMissingRelationError(badgeError)) throw badgeError;
  if (!badgeError) badges = (badgeRows ?? []) as Array<{ badge_key: string; earned_at: string }>;

  const { data: skillRows, error: skillError } = await supabase.from("child_skill_state").select("*").eq("child_id", childId);
  if (skillError && !isMissingRelationError(skillError)) throw skillError;
  if (!skillError) skillStates = (skillRows ?? []) as ChildSkillState[];

  const typedAttempts = (attempts ?? []) as Array<{
    activity_id: string;
    is_correct: boolean;
    score: number;
    created_at: string;
    answer: { attemptNumber?: number; skill?: CtSkill } | null;
  }>;

  const completions = typedAttempts.length;
  const correct = typedAttempts.filter((item) => item.is_correct).length;
  const accuracy = completions > 0 ? Math.round((correct / completions) * 100) : 0;

  const activityIds = typedAttempts.map((item) => item.activity_id);
  const { data: activityRows } =
    activityIds.length > 0
      ? await supabase.from("activities").select("id,skill,content").in("id", activityIds)
      : { data: [] as Array<{ id: string; skill: string; content?: { ct_skill?: CtSkill } }> };

  const skillMap = new Map<string, CtSkill>();
  (activityRows ?? []).forEach((row: { id: string; skill: string; content?: { ct_skill?: CtSkill } }) => {
    skillMap.set(row.id, row.content?.ct_skill ?? normalizeSkill(row.skill));
  });

  const skillBuckets = new Map<CtSkill, { total: number; correct: number }>();
  typedAttempts.forEach((attempt) => {
    const skill = attempt.answer?.skill ?? skillMap.get(attempt.activity_id) ?? "interpret";
    const bucket = skillBuckets.get(skill) ?? { total: 0, correct: 0 };
    bucket.total += 1;
    if (attempt.is_correct) bucket.correct += 1;
    skillBuckets.set(skill, bucket);
  });

  const bySkill = CT_SKILLS.map((skill) => {
    const bucket = skillBuckets.get(skill) ?? { total: 0, correct: 0 };
    return {
      skill,
      accuracy: bucket.total > 0 ? Math.round((bucket.correct / bucket.total) * 100) : 0,
      attempts: bucket.total
    };
  });

  const growthMap = new Map<string, { completions: number; correct: number }>();
  typedAttempts.forEach((attempt) => {
    const key = attempt.created_at.slice(0, 10);
    const row = growthMap.get(key) ?? { completions: 0, correct: 0 };
    row.completions += 1;
    if (attempt.is_correct) row.correct += 1;
    growthMap.set(key, row);
  });

  const growth = Array.from(growthMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14)
    .map(([date, row]) => ({
      date,
      completions: row.completions,
      accuracy: row.completions > 0 ? Math.round((row.correct / row.completions) * 100) : 0
    }));

  const badgeKeys = (badges ?? []).map((row: { badge_key: string }) => row.badge_key);
  const strategyRecoveries = typedAttempts.filter((item) => item.is_correct && item.answer?.attemptNumber === 2).length;
  const wins: string[] = [];
  const streakRow = (streak ?? null) as { current_streak: number } | null;

  if (strategyRecoveries >= 3) {
    wins.push(`Recovered after feedback ${strategyRecoveries} times`);
  }
  if (streakRow?.current_streak && streakRow.current_streak >= 3) {
    wins.push(`Current streak: ${streakRow.current_streak}`);
  }
  if (badgeKeys.length > 0) {
    wins.push(`Badges earned: ${badgeKeys.length}`);
  }

  const typedSkillStates = (skillStates ?? []) as ChildSkillState[];
  const xpTotal = typedSkillStates.reduce((sum, row) => sum + row.xp, 0);

  return {
    streak: streakRow?.current_streak ?? 0,
    completions,
    accuracy,
    bySkill,
    growth,
    wins,
    badgeKeys,
    badges: [10, 25, 50].filter((threshold) => completions >= threshold),
    xpTotal,
    skillLevels: typedSkillStates.map((row) => ({
      skill: row.skill,
      level: row.level,
      masteryScore: row.mastery_score,
      xp: row.xp
    }))
  };
}

export async function getChildWeeklyReport(childId: string): Promise<WeeklyReport> {
  const supabase = getSupabaseBrowserClient() as any;
  const now = new Date();
  const thisWeek = weekRangeDays(now);
  const thisWeekStart = thisWeek[0]?.startIso ?? getDayRange(now).startIso;

  const previousWeekAnchor = new Date(now);
  previousWeekAnchor.setDate(now.getDate() - 7);
  const prevWeek = weekRangeDays(previousWeekAnchor);
  const prevWeekStart = prevWeek[0]?.startIso ?? getDayRange(previousWeekAnchor).startIso;
  const thisWeekEnd = thisWeek[thisWeek.length - 1]?.endIso ?? getDayRange(now).endIso;

  const [{ data: attemptsRows, error: attemptsError }, { data: streakRow, error: streakError }] = await Promise.all([
    supabase
      .from("attempts")
      .select("activity_id,is_correct,created_at,answer")
      .eq("child_id", childId)
      .gte("created_at", prevWeekStart)
      .lt("created_at", thisWeekEnd)
      .order("created_at", { ascending: true }),
    supabase.from("streaks").select("current_streak").eq("child_id", childId).maybeSingle()
  ]);

  if (attemptsError) throw attemptsError;
  if (streakError) throw streakError;

  const typedAttempts = (attemptsRows ?? []) as Array<{
    activity_id: string;
    is_correct: boolean;
    created_at: string;
    answer: unknown;
  }>;

  const activityIds = Array.from(new Set(typedAttempts.map((item) => item.activity_id)));
  const { data: activityRows, error: activityError } =
    activityIds.length > 0
      ? await supabase.from("activities").select("id,skill,content").in("id", activityIds)
      : { data: [], error: null };

  if (activityError) throw activityError;

  const activitySkillMap = new Map<string, CtSkill>();
  (activityRows ?? []).forEach((row: { id: string; skill: string; content?: { ct_skill?: CtSkill } }) => {
    activitySkillMap.set(row.id, row.content?.ct_skill ?? normalizeSkill(row.skill));
  });

  const thisWeekAttempts = typedAttempts.filter((item) => item.created_at >= thisWeekStart && item.created_at < thisWeekEnd);
  const prevWeekAttempts = typedAttempts.filter((item) => item.created_at >= prevWeekStart && item.created_at < thisWeekStart);

  function summarizeBucket(rows: typeof typedAttempts) {
    const firstAttempts = rows.filter((item) => getAttemptMeta(item.answer, activitySkillMap, item.activity_id).attemptNumber === 1);
    const recoveryWins = rows.filter((item) => {
      const meta = getAttemptMeta(item.answer, activitySkillMap, item.activity_id);
      return meta.attemptNumber === 2 && item.is_correct;
    }).length;

    const rounds = firstAttempts.length;
    const sessions = new Set(firstAttempts.map((item) => item.created_at.slice(0, 10))).size;
    const firstTryCorrect = firstAttempts.filter((item) => item.is_correct).length;
    const firstTryAccuracy = rounds > 0 ? Math.round((firstTryCorrect / rounds) * 100) : 0;
    const masteryCorrect = Math.min(rounds, firstTryCorrect + recoveryWins);
    const masteryAccuracy = rounds > 0 ? Math.round((masteryCorrect / rounds) * 100) : 0;

    const bySkill = new Map<CtSkill, { attempts: number; correct: number }>();
    firstAttempts.forEach((item) => {
      const meta = getAttemptMeta(item.answer, activitySkillMap, item.activity_id);
      const bucket = bySkill.get(meta.skill) ?? { attempts: 0, correct: 0 };
      bucket.attempts += 1;
      if (item.is_correct) bucket.correct += 1;
      bySkill.set(meta.skill, bucket);
    });

    return {
      rounds,
      sessions,
      firstTryAccuracy,
      masteryAccuracy,
      recoveryWins,
      bySkill
    };
  }

  const thisWeekSummary = summarizeBucket(thisWeekAttempts);
  const prevWeekSummary = summarizeBucket(prevWeekAttempts);

  const daily = thisWeek.map((day) => {
    const rows = thisWeekAttempts.filter((item) => item.created_at >= day.startIso && item.created_at < day.endIso);
    const firstAttempts = rows.filter((item) => getAttemptMeta(item.answer, activitySkillMap, item.activity_id).attemptNumber === 1);
    const firstCorrect = firstAttempts.filter((item) => item.is_correct).length;
    const firstTryAccuracy = firstAttempts.length > 0 ? Math.round((firstCorrect / firstAttempts.length) * 100) : 0;
    return {
      date: day.key,
      rounds: firstAttempts.length,
      firstTryAccuracy
    };
  });

  const skillTrends = CT_SKILLS.map((skill) => {
    const current = thisWeekSummary.bySkill.get(skill) ?? { attempts: 0, correct: 0 };
    const previous = prevWeekSummary.bySkill.get(skill) ?? { attempts: 0, correct: 0 };
    const currentAccuracy = current.attempts > 0 ? Math.round((current.correct / current.attempts) * 100) : 0;
    const previousAccuracy = previous.attempts > 0 ? Math.round((previous.correct / previous.attempts) * 100) : 0;
    return {
      skill,
      label: SKILL_LABELS[skill],
      attempts: current.attempts,
      accuracy: currentAccuracy,
      deltaVsLastWeek: currentAccuracy - previousAccuracy
    };
  });

  const skillsWithAttempts = skillTrends.filter((item) => item.attempts > 0);
  const focusSkill =
    [...(skillsWithAttempts.length > 0 ? skillsWithAttempts : skillTrends)].sort((a, b) => a.accuracy - b.accuracy)[0]?.skill ??
    "interpret";
  const strongestSkill =
    [...(skillsWithAttempts.length > 0 ? skillsWithAttempts : skillTrends)].sort((a, b) => b.accuracy - a.accuracy)[0]?.skill ??
    "interpret";

  const wins: string[] = [];
  if (thisWeekSummary.masteryAccuracy >= 75) wins.push(`Mastery accuracy ${thisWeekSummary.masteryAccuracy}% this week`);
  if (thisWeekSummary.recoveryWins >= 2) wins.push(`Strategy recoveries: ${thisWeekSummary.recoveryWins}`);
  if ((streakRow as { current_streak?: number } | null)?.current_streak) {
    wins.push(`Current streak: ${(streakRow as { current_streak?: number }).current_streak ?? 0} days`);
  }
  if (wins.length === 0) wins.push("Consistency is building. Keep short daily sessions.");

  const coachNotes = [
    `Celebrate ${SKILL_LABELS[strongestSkill]}: this was the strongest track this week.`,
    `Focus next on ${SKILL_LABELS[focusSkill]} with two targeted rounds each day.`,
    `Aim for one recovery win each session by using the hint then retrying with evidence.`
  ];

  return {
    childId,
    range: {
      from: thisWeek[0]?.key ?? getDayRange(now).key,
      to: thisWeek[thisWeek.length - 1]?.key ?? getDayRange(now).key
    },
    roundsThisWeek: thisWeekSummary.rounds,
    sessionsThisWeek: thisWeekSummary.sessions,
    firstTryAccuracy: thisWeekSummary.firstTryAccuracy,
    masteryAccuracy: thisWeekSummary.masteryAccuracy,
    strategyRecoveries: thisWeekSummary.recoveryWins,
    streak: (streakRow as { current_streak?: number } | null)?.current_streak ?? 0,
    daily,
    skillTrends,
    wins,
    focusSkill,
    coachNotes
  };
}

export async function listChildBadges(childId: string): Promise<ChildBadge[]> {
  const supabase = getSupabaseBrowserClient() as any;
  const { data, error } = await supabase
    .from("child_badges")
    .select("*")
    .eq("child_id", childId)
    .order("earned_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ChildBadge[];
}
