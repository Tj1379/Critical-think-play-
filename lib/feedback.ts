import type { AgeBand } from "@/types/domain";
import type { CtSkill } from "@/lib/skills";

export type Skill = CtSkill;

export interface FeedbackInput {
  ageBand: AgeBand;
  skill: Skill;
  isCorrect: boolean;
  correctChoice: string;
  chosenChoice: string;
  explanation: string;
  strategyTip: string;
  attemptNumber: 1 | 2;
}

export interface FeedbackOutput {
  title: string;
  message: string;
  tip: string;
  celebrate?: string;
  hint?: string;
}

const celebrateBySkill: Record<Skill, string[]> = {
  interpret: ["You separated what you observed from what you assumed."],
  analyze: ["You broke the problem into clear parts before choosing."],
  evaluate: ["You checked evidence quality instead of guessing."],
  infer: ["You made the strongest conclusion from available clues."],
  explain: ["You connected the answer to evidence and reasoning."],
  self_regulate: ["You adjusted strategy when the first attempt did not work."]
};

const hintBySkill: Record<Skill, { short: string; long: string }> = {
  interpret: {
    short: "Hint: pick what you can directly SEE or MEASURE.",
    long: "Hint: separate direct observation from interpretation. Choose the option that can be verified immediately."
  },
  analyze: {
    short: "Hint: keep only one variable changing.",
    long: "Hint: break the task into steps and check whether each option keeps a fair comparison."
  },
  evaluate: {
    short: "Hint: choose the strongest evidence, not the loudest claim.",
    long: "Hint: ask which option uses reliable evidence, controls, and direct support for the claim."
  },
  infer: {
    short: "Hint: follow the clues to the most likely result.",
    long: "Hint: infer only what the provided evidence supports; avoid adding facts that were not given."
  },
  explain: {
    short: "Hint: match claim + evidence together.",
    long: "Hint: pick the answer that best connects the claim with evidence and a clear reason."
  },
  self_regulate: {
    short: "Hint: pause and check what might be missing.",
    long: "Hint: review your first approach, identify missing information, and select the option that corrects that gap."
  }
};

export function generateFeedback(i: FeedbackInput): FeedbackOutput {
  const short = i.ageBand === "4-6" || i.ageBand === "7-9";

  if (i.isCorrect) {
    const recovered = i.attemptNumber === 2;
    return {
      title: short ? "Strong move" : "Correct and strategic",
      message: short
        ? `${i.explanation}`
        : `You chose "${i.chosenChoice}." ${i.explanation}`,
      tip: i.strategyTip,
      celebrate: recovered
        ? "You improved after feedback and adjusted strategy."
        : celebrateBySkill[i.skill][0]
    };
  }

  if (i.attemptNumber === 1) {
    return {
      title: short ? "Not yet" : "Close, retry with strategy",
      message: short
        ? "That option does not fit best yet."
        : `"${i.chosenChoice}" is not the strongest option for this task.`,
      tip: i.strategyTip,
      hint: short ? hintBySkill[i.skill].short : hintBySkill[i.skill].long
    };
  }

  return {
    title: short ? "Let’s lock it in" : "Best reasoning walkthrough",
    message: short
      ? `Best answer: "${i.correctChoice}." ${i.explanation}`
      : `Best answer: "${i.correctChoice}." ${i.explanation} Use this strategy next: ${i.strategyTip}`,
    tip: i.strategyTip
  };
}
