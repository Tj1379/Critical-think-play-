-- Adaptive critical-thinking upgrade

do $$
begin
  create type public.ct_skill as enum ('interpret', 'analyze', 'evaluate', 'infer', 'explain', 'self_regulate');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.child_skill_state (
  child_id uuid not null references public.child_profiles(id) on delete cascade,
  skill public.ct_skill not null,
  level int not null default 1 check (level between 1 and 5),
  xp int not null default 0,
  mastery_score numeric not null default 0 check (mastery_score >= 0 and mastery_score <= 1),
  updated_at timestamptz not null default now(),
  primary key (child_id, skill)
);

create table if not exists public.child_badges (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.child_profiles(id) on delete cascade,
  badge_key text not null,
  earned_at timestamptz not null default now(),
  unique (child_id, badge_key)
);

create table if not exists public.review_queue (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.child_profiles(id) on delete cascade,
  activity_id text not null references public.activities(id) on delete cascade,
  skill public.ct_skill not null,
  due_at timestamptz not null,
  interval_days int not null default 1,
  ease numeric not null default 2.5,
  last_result boolean,
  created_at timestamptz not null default now(),
  unique (child_id, activity_id)
);

create index if not exists review_queue_due_at_idx on public.review_queue (child_id, due_at);
create index if not exists child_badges_child_idx on public.child_badges (child_id);

create table if not exists public.child_adaptive_settings (
  child_id uuid primary key references public.child_profiles(id) on delete cascade,
  main_rounds int not null default 1 check (main_rounds between 1 and 4),
  boss_enabled boolean not null default true,
  boss_intensity int not null default 3 check (boss_intensity between 1 and 5),
  hint_mode text not null default 'guided' check (hint_mode in ('guided', 'minimal', 'off')),
  daily_goal int not null default 3 check (daily_goal between 1 and 10),
  updated_at timestamptz not null default now()
);

alter table public.child_skill_state enable row level security;
alter table public.child_badges enable row level security;
alter table public.review_queue enable row level security;
alter table public.child_adaptive_settings enable row level security;

drop policy if exists "skill state owner select" on public.child_skill_state;
create policy "skill state owner select"
  on public.child_skill_state
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.child_profiles cp
      where cp.id = child_skill_state.child_id
        and cp.parent_user_id = auth.uid()
    )
  );

drop policy if exists "skill state owner insert" on public.child_skill_state;
create policy "skill state owner insert"
  on public.child_skill_state
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.child_profiles cp
      where cp.id = child_skill_state.child_id
        and cp.parent_user_id = auth.uid()
    )
  );

drop policy if exists "skill state owner update" on public.child_skill_state;
create policy "skill state owner update"
  on public.child_skill_state
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.child_profiles cp
      where cp.id = child_skill_state.child_id
        and cp.parent_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.child_profiles cp
      where cp.id = child_skill_state.child_id
        and cp.parent_user_id = auth.uid()
    )
  );

drop policy if exists "badges owner select" on public.child_badges;
create policy "badges owner select"
  on public.child_badges
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.child_profiles cp
      where cp.id = child_badges.child_id
        and cp.parent_user_id = auth.uid()
    )
  );

drop policy if exists "badges owner insert" on public.child_badges;
create policy "badges owner insert"
  on public.child_badges
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.child_profiles cp
      where cp.id = child_badges.child_id
        and cp.parent_user_id = auth.uid()
    )
  );

drop policy if exists "review queue owner select" on public.review_queue;
create policy "review queue owner select"
  on public.review_queue
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.child_profiles cp
      where cp.id = review_queue.child_id
        and cp.parent_user_id = auth.uid()
    )
  );

drop policy if exists "review queue owner insert" on public.review_queue;
create policy "review queue owner insert"
  on public.review_queue
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.child_profiles cp
      where cp.id = review_queue.child_id
        and cp.parent_user_id = auth.uid()
    )
  );

drop policy if exists "review queue owner update" on public.review_queue;
create policy "review queue owner update"
  on public.review_queue
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.child_profiles cp
      where cp.id = review_queue.child_id
        and cp.parent_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.child_profiles cp
      where cp.id = review_queue.child_id
        and cp.parent_user_id = auth.uid()
    )
  );

drop policy if exists "adaptive settings owner select" on public.child_adaptive_settings;
create policy "adaptive settings owner select"
  on public.child_adaptive_settings
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.child_profiles cp
      where cp.id = child_adaptive_settings.child_id
        and cp.parent_user_id = auth.uid()
    )
  );

drop policy if exists "adaptive settings owner insert" on public.child_adaptive_settings;
create policy "adaptive settings owner insert"
  on public.child_adaptive_settings
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.child_profiles cp
      where cp.id = child_adaptive_settings.child_id
        and cp.parent_user_id = auth.uid()
    )
  );

drop policy if exists "adaptive settings owner update" on public.child_adaptive_settings;
create policy "adaptive settings owner update"
  on public.child_adaptive_settings
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.child_profiles cp
      where cp.id = child_adaptive_settings.child_id
        and cp.parent_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.child_profiles cp
      where cp.id = child_adaptive_settings.child_id
        and cp.parent_user_id = auth.uid()
    )
  );
