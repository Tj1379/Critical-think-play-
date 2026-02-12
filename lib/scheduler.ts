import type { CtSkill } from "@/lib/skills";

export type Skill = CtSkill;

export interface AttemptSummary {
  skill: Skill;
  isCorrect: boolean;
  createdAt: string;
  responseTimeMs?: number;
}

export interface SkillState {
  skill: Skill;
  level: 1 | 2 | 3 | 4 | 5;
  masteryScore: number;
}

export interface NextItemPlan {
  mode: "warmup" | "main" | "boss" | "review";
  skill: Skill;
  targetDifficulty: number;
  source: "review_queue" | "new_pool";
}

export function chooseNextItem(opts: {
  now: Date;
  dueReviewCount: number;
  dueReviewBySkill?: Partial<Record<Skill, number>>;
  skillStates: SkillState[];
  recentAttempts: AttemptSummary[];
  sessionStep: "warmup" | "main" | "boss";
}): NextItemPlan {
  const { dueReviewCount, dueReviewBySkill, skillStates, recentAttempts, sessionStep } = opts;

  const recentWindow = recentAttempts.slice(-16);
  const errorsBySkill = new Map<Skill, number>();
  recentWindow.forEach((attempt) => {
    if (!attempt.isCorrect) {
      errorsBySkill.set(attempt.skill, (errorsBySkill.get(attempt.skill) ?? 0) + 1);
    }
  });

  const weakest = [...skillStates].sort((a, b) => {
    const aErrors = errorsBySkill.get(a.skill) ?? 0;
    const bErrors = errorsBySkill.get(b.skill) ?? 0;
    const aWeakness = (1 - a.masteryScore) + aErrors * 0.06;
    const bWeakness = (1 - b.masteryScore) + bErrors * 0.06;
    return bWeakness - aWeakness;
  })[0];

  const nearLevelUp = [...skillStates].sort((a, b) => {
    const aScore = a.level * 0.35 + a.masteryScore;
    const bScore = b.level * 0.35 + b.masteryScore;
    return bScore - aScore;
  })[0];

  if (dueReviewCount > 0 && sessionStep !== "boss") {
    const dueSkill =
      Object.entries(dueReviewBySkill ?? {}).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] ?? weakest.skill;

    return {
      mode: "review",
      skill: dueSkill as Skill,
      targetDifficulty: weakest.level,
      source: "review_queue"
    };
  }

  if (sessionStep === "warmup") {
    return {
      mode: "warmup",
      skill: weakest.skill,
      targetDifficulty: Math.max(1, weakest.level - 1),
      source: "new_pool"
    };
  }

  if (sessionStep === "boss") {
    return {
      mode: "boss",
      skill: nearLevelUp.skill,
      targetDifficulty: Math.min(5, nearLevelUp.level + 1),
      source: "new_pool"
    };
  }

  return {
    mode: "main",
    skill: weakest.skill,
    targetDifficulty: weakest.level,
    source: "new_pool"
  };
}

export function computeNextReview(opts: {
  now: Date;
  wasCorrect: boolean;
  previousIntervalDays?: number;
  previousEase?: number;
  attemptNumber: 1 | 2;
}): {
  intervalDays: number;
  ease: number;
  dueAtIso: string;
} {
  const previousInterval = Math.max(1, opts.previousIntervalDays ?? 1);
  const previousEase = Math.max(1.3, opts.previousEase ?? 2.5);

  let intervalDays = 1;
  let ease = previousEase;

  if (opts.wasCorrect) {
    const quality = opts.attemptNumber === 1 ? 4 : 3;
    ease = Math.max(1.3, Math.min(2.8, previousEase + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))));
    intervalDays = Math.max(1, Math.round(previousInterval * ease));
  } else {
    ease = Math.max(1.3, previousEase - 0.2);
    intervalDays = 1;
  }

  const dueAt = new Date(opts.now.getTime() + intervalDays * 24 * 60 * 60 * 1000);

  return {
    intervalDays,
    ease,
    dueAtIso: dueAt.toISOString()
  };
}
