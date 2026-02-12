import type { CtSkill } from "@/lib/skills";

export type SessionMode = "warmup" | "main" | "boss" | "review";

export const LEVEL_XP_REQUIREMENTS: Record<1 | 2 | 3 | 4, number> = {
  1: 80,
  2: 200,
  3: 360,
  4: 560
};

export function computeXpAward(input: {
  mode: SessionMode;
  isCorrect: boolean;
  attemptNumber: 1 | 2;
  usedHint: boolean;
}): {
  xpAwarded: number;
  strategyXp: number;
} {
  const modeBase: Record<SessionMode, number> = {
    warmup: 10,
    main: 16,
    review: 18,
    boss: 28
  };

  let xp = modeBase[input.mode];
  let strategyXp = 0;

  if (input.isCorrect) {
    xp += input.attemptNumber === 1 ? 10 : 6;
  } else {
    xp += 2;
  }

  // Rewarding strategy behavior, not only raw correctness.
  if (input.usedHint) {
    xp += 5;
    strategyXp += 5;
  }

  if (input.attemptNumber === 2 && input.isCorrect) {
    xp += 8;
    strategyXp += 8;
  }

  return { xpAwarded: xp, strategyXp };
}

function computeQuality(input: {
  isCorrect: boolean;
  attemptNumber: 1 | 2;
  usedHint: boolean;
}): number {
  if (input.isCorrect && input.attemptNumber === 1) {
    return input.usedHint ? 0.9 : 1;
  }
  if (input.isCorrect && input.attemptNumber === 2) {
    return 0.75;
  }
  return input.attemptNumber === 1 ? 0.35 : 0.2;
}

export function updateMasteryState(input: {
  currentLevel: 1 | 2 | 3 | 4 | 5;
  currentXp: number;
  currentMasteryScore: number;
  isCorrect: boolean;
  attemptNumber: 1 | 2;
  usedHint: boolean;
  mode: SessionMode;
}): {
  newLevel: 1 | 2 | 3 | 4 | 5;
  newXp: number;
  newMasteryScore: number;
  leveledUp: boolean;
  xpAwarded: number;
  strategyXp: number;
} {
  const { xpAwarded, strategyXp } = computeXpAward({
    mode: input.mode,
    isCorrect: input.isCorrect,
    attemptNumber: input.attemptNumber,
    usedHint: input.usedHint
  });

  const newXp = input.currentXp + xpAwarded;
  const quality = computeQuality({
    isCorrect: input.isCorrect,
    attemptNumber: input.attemptNumber,
    usedHint: input.usedHint
  });

  const newMasteryScore = Math.max(0, Math.min(1, input.currentMasteryScore * 0.78 + quality * 0.22));

  let newLevel: 1 | 2 | 3 | 4 | 5 = input.currentLevel;
  let leveledUp = false;

  while (newLevel < 5) {
    const requirement = LEVEL_XP_REQUIREMENTS[newLevel as 1 | 2 | 3 | 4];
    if (newXp >= requirement && newMasteryScore >= 0.82) {
      newLevel = (newLevel + 1) as 1 | 2 | 3 | 4 | 5;
      leveledUp = true;
    } else {
      break;
    }
  }

  return {
    newLevel,
    newXp,
    newMasteryScore,
    leveledUp,
    xpAwarded,
    strategyXp
  };
}

export function badgeKeysForMilestones(input: {
  skill: CtSkill;
  newLevel: number;
  isBoss: boolean;
  isCorrect: boolean;
  solvedOnRetry: boolean;
}): string[] {
  const badges: string[] = [];

  if (input.newLevel >= 3) {
    badges.push(`track_${input.skill}_adept`);
  }

  if (input.newLevel >= 5) {
    badges.push(`track_${input.skill}_master`);
  }

  if (input.isBoss && input.isCorrect) {
    badges.push("boss_challenge_clear");
  }

  if (input.solvedOnRetry) {
    badges.push("strategy_retry_recovery");
  }

  return [...new Set(badges)];
}
