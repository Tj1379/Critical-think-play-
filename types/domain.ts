export type AgeBand = "4-6" | "7-9" | "10-13" | "14-18" | "adult";
export type CtSkill = "interpret" | "analyze" | "evaluate" | "infer" | "explain" | "self_regulate";
export type SessionMode = "warmup" | "main" | "boss" | "review";
export type HintMode = "guided" | "minimal" | "off";

export type ChildProfile = {
  id: string;
  parent_user_id: string;
  name: string;
  age_band: AgeBand;
  reading_level: string;
  avatar: string | null;
  created_at: string;
};

export type Activity = {
  id: string;
  age_band: AgeBand;
  type: string;
  skill: string;
  difficulty: string | number;
  title: string;
  content: {
    story?: string;
    image?: string;
    method?: string;
    evidence_note?: string;
    debrief?: string;
    ct_skill?: CtSkill;
    mode?: SessionMode;
    prompt: string;
    choices: string[];
    correctIndex: number;
    explanation: string;
    tip: string;
  };
};

export type Attempt = {
  id: string;
  child_id: string;
  activity_id: string;
  is_correct: boolean;
  score: number;
  answer: {
    choiceIndex: number;
    attemptNumber?: 1 | 2;
    responseTimeMs?: number;
    sessionMode?: SessionMode;
    skill?: CtSkill;
    usedHint?: boolean;
  };
  created_at: string;
};

export type ChildSkillState = {
  child_id: string;
  skill: CtSkill;
  level: 1 | 2 | 3 | 4 | 5;
  xp: number;
  mastery_score: number;
  updated_at: string;
};

export type ChildBadge = {
  id: string;
  child_id: string;
  badge_key: string;
  earned_at: string;
};

export type ReviewQueueItem = {
  id: string;
  child_id: string;
  activity_id: string;
  skill: CtSkill;
  due_at: string;
  interval_days: number;
  ease: number;
  last_result: boolean | null;
  created_at: string;
};

export type ChildAdaptiveSettings = {
  child_id: string;
  main_rounds: number;
  boss_enabled: boolean;
  boss_intensity: number;
  hint_mode: HintMode;
  daily_goal: number;
  updated_at: string;
};
