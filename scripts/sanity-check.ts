import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateFeedback } from "@/lib/feedback";
import { chooseNextItem } from "@/lib/scheduler";
import { CT_SKILLS, normalizeSkill } from "@/lib/skills";

type Activity = {
  id: string;
  type: string;
  skill: string;
  content: {
    choices: string[];
    correctIndex: number;
  };
};

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function loadActivities(): Promise<Activity[]> {
  const currentFile = fileURLToPath(import.meta.url);
  const root = path.dirname(path.dirname(currentFile));
  const contentDir = path.join(root, "content");
  const files = (await fs.readdir(contentDir)).filter((file) => file.endsWith(".json"));

  const chunks = await Promise.all(
    files.map(async (file) => {
      const raw = await fs.readFile(path.join(contentDir, file), "utf8");
      return JSON.parse(raw) as Activity[];
    })
  );

  const byId = new Map<string, Activity>();
  chunks.flat().forEach((item) => byId.set(item.id, item));
  return Array.from(byId.values());
}

async function run() {
  const feedback = generateFeedback({
    ageBand: "10-13",
    skill: "evaluate",
    isCorrect: false,
    correctChoice: "A",
    chosenChoice: "B",
    explanation: "Because A has stronger evidence.",
    strategyTip: "Compare source quality.",
    attemptNumber: 1
  });

  assert(Boolean(feedback.hint), "feedback should return a hint on first incorrect attempt");

  const plan = chooseNextItem({
    now: new Date(),
    dueReviewCount: 2,
    dueReviewBySkill: { evaluate: 2 },
    skillStates: CT_SKILLS.map((skill) => ({
      skill,
      level: 1,
      masteryScore: 0.4
    })),
    recentAttempts: [],
    sessionStep: "main"
  });

  assert(plan.source === "review_queue", "scheduler should prefer due reviews during main step");

  const activities = await loadActivities();
  assert(activities.length > 0, "seed content should not be empty");

  const requiredTypes = ["warmup", "main", "boss", "review"];
  requiredTypes.forEach((required) => {
    assert(
      activities.some((activity) => activity.type === required),
      `seed examples should include type: ${required}`
    );
  });

  const missingSkillMappings = activities.filter((activity) => !CT_SKILLS.includes(normalizeSkill(activity.skill)));
  assert(missingSkillMappings.length === 0, "all activity skills should map to ct skills");

  const invalidChoiceSets = activities.filter(
    (activity) => activity.content.choices.length < 2 || activity.content.correctIndex >= activity.content.choices.length
  );
  assert(invalidChoiceSets.length === 0, "all activities need valid choices and correct index");

  console.log(`Sanity checks passed for ${activities.length} activities.`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
