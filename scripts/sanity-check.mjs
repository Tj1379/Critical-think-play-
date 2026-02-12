import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const contentDir = path.join(root, "content");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function hasPlaceholderText(input) {
  const text = String(input || "").trim().toLowerCase();
  if (!text) return true;
  return [
    "red blue red blue next car",
    "red blue red blue next sleep",
    "option a for",
    "option b for",
    "option c for",
    "option d for"
  ].some((token) => text.includes(token));
}

const CT_SKILLS = new Set(["interpret", "analyze", "evaluate", "infer", "explain", "self_regulate"]);

function normalizeSkill(input) {
  const key = String(input || "").trim().toLowerCase().replace(/\s+/g, "_");
  const map = {
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

  if (CT_SKILLS.has(key)) return key;
  return map[key] || "interpret";
}

async function loadActivities() {
  const files = (await fs.readdir(contentDir)).filter((file) => file.endsWith(".json"));
  const chunks = await Promise.all(
    files.map(async (file) => {
      const raw = await fs.readFile(path.join(contentDir, file), "utf8");
      return JSON.parse(raw);
    })
  );

  const byId = new Map();
  chunks.flat().forEach((activity) => byId.set(activity.id, activity));
  return Array.from(byId.values());
}

async function run() {
  const activities = await loadActivities();
  assert(activities.length > 0, "no activities found in /content");

  const requiredTypes = ["warmup", "main", "boss", "review"];
  requiredTypes.forEach((type) => {
    assert(activities.some((activity) => activity.type === type), `missing required item type: ${type}`);
  });

  const seenTracks = new Set(activities.map((activity) => normalizeSkill(activity.content?.ct_skill || activity.skill)));
  CT_SKILLS.forEach((track) => {
    assert(seenTracks.has(track), `missing ct skill coverage: ${track}`);
  });

  const badChoices = activities.filter((activity) => {
    const choices = activity.content?.choices || [];
    const idx = activity.content?.correctIndex;
    const prompt = activity.content?.prompt || activity.content?.question;
    return (
      !prompt ||
      !Array.isArray(choices) ||
      choices.length < 2 ||
      typeof idx !== "number" ||
      idx < 0 ||
      idx >= choices.length ||
      choices.some((choice) => typeof choice !== "string" || hasPlaceholderText(choice))
    );
  });

  assert(badChoices.length === 0, "found activities with invalid or placeholder prompt/choices/correctIndex");

  const ageBands = ["4-6", "7-9", "10-13", "14-18", "adult"];
  ageBands.forEach((band) => {
    assert(activities.some((activity) => activity.age_band === band), `missing age band coverage: ${band}`);
  });

  console.log(`Sanity checks passed for ${activities.length} unique activities.`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
