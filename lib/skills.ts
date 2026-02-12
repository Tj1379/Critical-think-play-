export const CT_SKILLS = [
  "interpret",
  "analyze",
  "evaluate",
  "infer",
  "explain",
  "self_regulate"
] as const;

export type CtSkill = (typeof CT_SKILLS)[number];

export const SKILL_LABELS: Record<CtSkill, string> = {
  interpret: "Interpret",
  analyze: "Analyze",
  evaluate: "Evaluate",
  infer: "Infer",
  explain: "Explain",
  self_regulate: "Self-Regulate"
};

export const SKILL_DESCRIPTIONS: Record<CtSkill, string> = {
  interpret: "Understand what information means and separate observation from assumption.",
  analyze: "Break complex tasks into parts and detect relationships.",
  evaluate: "Judge evidence quality and source credibility.",
  infer: "Draw the best conclusion from available information.",
  explain: "Justify claims clearly with evidence.",
  self_regulate: "Monitor thinking, catch mistakes, and adjust strategy."
};

const LEGACY_MAP: Record<string, CtSkill> = {
  observation: "interpret",
  observation_vs_inference: "interpret",
  classification: "interpret",
  pattern: "interpret",
  fair_test: "analyze",
  variables: "analyze",
  sequencing: "analyze",
  tools: "analyze",
  evidence: "evaluate",
  sample_size: "evaluate",
  credibility: "evaluate",
  source_check: "evaluate",
  "source-check": "evaluate",
  data_analysis: "evaluate",
  cause_effect: "infer",
  "cause-effect": "infer",
  prediction: "infer",
  explain: "explain",
  cer: "explain",
  self_regulate: "self_regulate",
  self_regulation: "self_regulate",
  elimination: "self_regulate",
  engineering_design: "self_regulate"
};

export function normalizeSkill(input: string): CtSkill {
  const key = input.trim().toLowerCase().replace(/\s+/g, "_");
  if ((CT_SKILLS as readonly string[]).includes(key)) {
    return key as CtSkill;
  }
  return LEGACY_MAP[key] ?? "interpret";
}

export function difficultyToLevel(input: string | number): number {
  if (typeof input === "number") {
    return Math.max(1, Math.min(5, Math.round(input)));
  }

  const key = input.trim().toLowerCase();
  if (key === "easy") return 1;
  if (key === "medium") return 3;
  if (key === "hard") return 5;
  const parsed = Number.parseInt(key, 10);
  if (Number.isFinite(parsed)) {
    return Math.max(1, Math.min(5, parsed));
  }
  return 2;
}

export function levelToDifficulty(level: number): "easy" | "medium" | "hard" {
  if (level <= 2) return "easy";
  if (level <= 4) return "medium";
  return "hard";
}
