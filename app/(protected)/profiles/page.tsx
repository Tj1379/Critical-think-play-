"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createChildProfile,
  deleteChildProfile,
  getChildAdaptiveSettings,
  listChildrenForCurrentParent,
  updateChildAdaptiveSettings,
  updateChildProfile
} from "@/lib/data";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { AgeBand, ChildAdaptiveSettings, ChildProfile, HintMode } from "@/types/domain";

const ACTIVE_CHILD_KEY = "activeChildId";
const AGE_BANDS: AgeBand[] = ["4-6", "7-9", "10-13", "14-18", "adult"];

type FormState = {
  name: string;
  age_band: AgeBand;
  reading_level: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  age_band: "7-9",
  reading_level: "early"
};

type AdaptiveFormState = Pick<ChildAdaptiveSettings, "main_rounds" | "boss_enabled" | "boss_intensity" | "hint_mode" | "daily_goal">;

const EMPTY_ADAPTIVE_FORM: AdaptiveFormState = {
  main_rounds: 1,
  boss_enabled: true,
  boss_intensity: 3,
  hint_mode: "guided",
  daily_goal: 3
};

const HINT_MODE_OPTIONS: Array<{ value: HintMode; label: string }> = [
  { value: "guided", label: "Guided hints" },
  { value: "minimal", label: "Minimal hints" },
  { value: "off", label: "No hints" }
];

export default function ProfilesPage() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<ChildProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsChild, setSettingsChild] = useState<ChildProfile | null>(null);
  const [settingsForm, setSettingsForm] = useState<AdaptiveFormState>(EMPTY_ADAPTIVE_FORM);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setStatus("");
    try {
      const rows = await listChildrenForCurrentParent();
      setProfiles(rows);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load profiles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setIsSettingsModalOpen(false);
    setIsModalOpen(true);
  };

  const openEdit = (profile: ChildProfile) => {
    setEditId(profile.id);
    setForm({
      name: profile.name,
      age_band: profile.age_band,
      reading_level: profile.reading_level
    });
    setIsSettingsModalOpen(false);
    setIsModalOpen(true);
  };

  const openAdaptiveSettings = async (profile: ChildProfile) => {
    setSettingsChild(profile);
    setSettingsForm(EMPTY_ADAPTIVE_FORM);
    setSettingsLoading(true);
    setIsModalOpen(false);
    setIsSettingsModalOpen(true);
    setStatus("");

    try {
      const settings = await getChildAdaptiveSettings(profile.id);
      setSettingsForm({
        main_rounds: settings.main_rounds,
        boss_enabled: settings.boss_enabled,
        boss_intensity: settings.boss_intensity,
        hint_mode: settings.hint_mode,
        daily_goal: settings.daily_goal
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load adaptive settings");
    } finally {
      setSettingsLoading(false);
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (editId) {
        await updateChildProfile(editId, form);
      } else {
        await createChildProfile(form);
      }
      setIsModalOpen(false);
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save profile");
    }
  };

  const onSaveAdaptiveSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (!settingsChild) return;

    setSettingsSaving(true);
    setStatus("");
    try {
      const saved = await updateChildAdaptiveSettings(settingsChild.id, {
        main_rounds: settingsForm.main_rounds,
        boss_enabled: settingsForm.boss_enabled,
        boss_intensity: settingsForm.boss_intensity,
        hint_mode: settingsForm.hint_mode,
        daily_goal: settingsForm.daily_goal
      });

      setSettingsForm({
        main_rounds: saved.main_rounds,
        boss_enabled: saved.boss_enabled,
        boss_intensity: saved.boss_intensity,
        hint_mode: saved.hint_mode,
        daily_goal: saved.daily_goal
      });
      setIsSettingsModalOpen(false);
      setSettingsChild(null);
      setStatus(`Saved adaptive settings for ${settingsChild.name}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save adaptive settings");
    } finally {
      setSettingsSaving(false);
    }
  };

  const onDelete = async (profileId: string) => {
    if (!window.confirm("Delete this child profile?")) return;
    try {
      await deleteChildProfile(profileId);
      if (localStorage.getItem(ACTIVE_CHILD_KEY) === profileId) {
        localStorage.removeItem(ACTIVE_CHILD_KEY);
      }
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to delete profile");
    }
  };

  const onSelect = (profileId: string) => {
    localStorage.setItem(ACTIVE_CHILD_KEY, profileId);
    router.push(`/play?child=${profileId}`);
  };

  const onLogout = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    localStorage.removeItem(ACTIVE_CHILD_KEY);
    router.replace("/login");
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Child Profiles</h2>
        <button className="rounded-xl bg-leaf px-4 py-2 text-sm font-semibold text-white" onClick={openCreate}>
          Add Child
        </button>
      </div>

      <button className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-ink/80" onClick={onLogout}>
        Log out
      </button>

      {status && <p className="text-sm text-red-600">{status}</p>}
      {loading && <p className="text-sm text-ink/70">Loading profiles...</p>}

      <ul className="space-y-3">
        {profiles.map((profile) => (
          <li key={profile.id} className="rounded-2xl bg-white/90 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-ink">{profile.name}</h3>
                <p className="text-sm text-ink/70">
                  Age {profile.age_band} · Reading {profile.reading_level}
                </p>
              </div>
              <button
                className="rounded-xl bg-ink px-3 py-2 text-sm font-semibold text-white"
                onClick={() => onSelect(profile.id)}
              >
                Select
              </button>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                className="rounded-xl bg-mint px-3 py-1 text-xs font-semibold text-ink"
                onClick={() => openEdit(profile)}
              >
                Edit
              </button>
              <button
                className="rounded-xl bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800"
                onClick={() => openAdaptiveSettings(profile)}
              >
                Adaptive Settings
              </button>
              <button
                className="rounded-xl bg-red-50 px-3 py-1 text-xs font-semibold text-red-700"
                onClick={() => onDelete(profile.id)}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      {isModalOpen && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4">
          <form className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-lg" onSubmit={onSubmit}>
            <h3 className="text-lg font-bold text-ink">{editId ? "Edit Child" : "Create Child"}</h3>

            <label className="mt-3 block text-sm font-semibold text-ink">
              Name
              <input
                required
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-leaf/20 px-3 py-2"
              />
            </label>

            <label className="mt-3 block text-sm font-semibold text-ink">
              Age Band
              <select
                value={form.age_band}
                onChange={(event) => setForm((prev) => ({ ...prev, age_band: event.target.value as AgeBand }))}
                className="mt-1 w-full rounded-xl border border-leaf/20 px-3 py-2"
              >
                {AGE_BANDS.map((ageBand) => (
                  <option key={ageBand} value={ageBand}>
                    {ageBand}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-3 block text-sm font-semibold text-ink">
              Reading Level
              <input
                required
                value={form.reading_level}
                onChange={(event) => setForm((prev) => ({ ...prev, reading_level: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-leaf/20 px-3 py-2"
                placeholder="early, intermediate, advanced"
              />
            </label>

            <div className="mt-4 flex gap-2">
              <button type="submit" className="flex-1 rounded-xl bg-leaf px-3 py-2 text-sm font-semibold text-white">
                Save
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700"
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {isSettingsModalOpen && settingsChild && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4">
          <form className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-lg" onSubmit={onSaveAdaptiveSettings}>
            <h3 className="text-lg font-bold text-ink">Adaptive Settings</h3>
            <p className="mt-1 text-xs text-ink/70">{settingsChild.name}</p>

            {settingsLoading ? (
              <p className="mt-4 text-sm text-ink/70">Loading settings...</p>
            ) : (
              <>
                <label className="mt-3 block text-sm font-semibold text-ink">
                  Main Rounds Per Session
                  <select
                    value={settingsForm.main_rounds}
                    onChange={(event) =>
                      setSettingsForm((prev) => ({ ...prev, main_rounds: Math.max(1, Math.min(4, Number(event.target.value) || 1)) }))
                    }
                    className="mt-1 w-full rounded-xl border border-leaf/20 px-3 py-2"
                  >
                    {[1, 2, 3, 4].map((count) => (
                      <option key={count} value={count}>
                        {count}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-ink">
                  <input
                    type="checkbox"
                    checked={settingsForm.boss_enabled}
                    onChange={(event) => setSettingsForm((prev) => ({ ...prev, boss_enabled: event.target.checked }))}
                  />
                  Enable Daily Boss Challenge
                </label>

                <label className="mt-3 block text-sm font-semibold text-ink">
                  Boss Intensity (1-5)
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={settingsForm.boss_intensity}
                    onChange={(event) =>
                      setSettingsForm((prev) => ({ ...prev, boss_intensity: Math.max(1, Math.min(5, Number(event.target.value) || 3)) }))
                    }
                    className="mt-1 w-full rounded-xl border border-leaf/20 px-3 py-2"
                  />
                </label>

                <label className="mt-3 block text-sm font-semibold text-ink">
                  Hint Mode
                  <select
                    value={settingsForm.hint_mode}
                    onChange={(event) => setSettingsForm((prev) => ({ ...prev, hint_mode: event.target.value as HintMode }))}
                    className="mt-1 w-full rounded-xl border border-leaf/20 px-3 py-2"
                  >
                    {HINT_MODE_OPTIONS.map((mode) => (
                      <option key={mode.value} value={mode.value}>
                        {mode.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="mt-3 block text-sm font-semibold text-ink">
                  Daily Goal (rounds)
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={settingsForm.daily_goal}
                    onChange={(event) =>
                      setSettingsForm((prev) => ({ ...prev, daily_goal: Math.max(1, Math.min(10, Number(event.target.value) || 3)) }))
                    }
                    className="mt-1 w-full rounded-xl border border-leaf/20 px-3 py-2"
                  />
                </label>
              </>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="submit"
                disabled={settingsLoading || settingsSaving}
                className="flex-1 rounded-xl bg-leaf px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {settingsSaving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700"
                onClick={() => {
                  setIsSettingsModalOpen(false);
                  setSettingsChild(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
