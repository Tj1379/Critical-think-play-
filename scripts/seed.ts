import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(url, serviceRoleKey, {
  auth: {
    persistSession: false
  }
});

type SeedActivity = {
  id: string;
  age_band: string;
  type: string;
  skill: string;
  difficulty: string | number;
  title: string;
  content: Record<string, unknown>;
};

async function loadSeedActivities(): Promise<SeedActivity[]> {
  const currentFile = fileURLToPath(import.meta.url);
  const root = path.dirname(path.dirname(currentFile));
  const contentDir = path.join(root, "content");

  const files = (await fs.readdir(contentDir)).filter((file) => file.endsWith(".json"));

  const chunks = await Promise.all(
    files.map(async (file) => {
      const fullPath = path.join(contentDir, file);
      const raw = await fs.readFile(fullPath, "utf8");
      const parsed = JSON.parse(raw) as SeedActivity[];
      return parsed;
    })
  );

  const deduped = new Map<string, SeedActivity>();
  chunks.flat().forEach((activity) => {
    deduped.set(activity.id, activity);
  });

  return Array.from(deduped.values());
}

async function run() {
  const activities = await loadSeedActivities();

  const { error: deleteError } = await supabase.from("activities").delete().neq("id", "__none__");
  if (deleteError) throw deleteError;

  const { error: insertError } = await supabase.from("activities").insert(activities);
  if (insertError) throw insertError;

  console.log(`Re-seeded ${activities.length} activities from /content JSON packs.`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
