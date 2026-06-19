-- BistroPet initial Supabase schema
-- Current app flows only: pet profile, recipes, saved history, weekly plans and manual blocked ingredients.
-- Authentication will use Supabase Auth. All app tables are scoped by auth.uid().

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.pet_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_name text not null default '',
  tutor_name text not null default '',
  age_text text not null default '',
  weight_text text not null default '',
  size_text text not null default '',
  menu_style text not null default 'padrao',
  notes text not null default '',
  schema_version integer not null default 2,
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pet_profiles_id_user_id_unique unique (id, user_id),
  constraint pet_profiles_menu_style_check check (menu_style in ('padrao', 'personalizada')),
  constraint pet_profiles_one_profile_per_user unique (user_id)
);

create index if not exists pet_profiles_user_id_idx on public.pet_profiles(user_id);

drop trigger if exists set_pet_profiles_updated_at on public.pet_profiles;
create trigger set_pet_profiles_updated_at
before update on public.pet_profiles
for each row execute function public.set_updated_at();

create table if not exists public.pet_blocked_ingredients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_profile_id uuid not null references public.pet_profiles(id) on delete cascade,
  ingredient_name text not null,
  source text not null default 'manual_recipe',
  created_at timestamptz not null default now(),
  constraint pet_blocked_ingredients_pet_user_fk foreign key (pet_profile_id, user_id) references public.pet_profiles(id, user_id) on delete cascade,
  constraint pet_blocked_ingredients_source_check check (source in ('manual_recipe', 'profile_observation')),
  constraint pet_blocked_ingredients_unique unique (pet_profile_id, ingredient_name, source)
);

create index if not exists pet_blocked_ingredients_user_id_idx on public.pet_blocked_ingredients(user_id);
create index if not exists pet_blocked_ingredients_pet_profile_id_idx on public.pet_blocked_ingredients(pet_profile_id);

create table if not exists public.recipe_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_profile_id uuid not null references public.pet_profiles(id) on delete cascade,
  recipe_type text not null,
  title text not null default '',
  description text not null default '',
  ingredients jsonb not null default '[]'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  image_url text,
  request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipe_generations_id_user_id_unique unique (id, user_id),
  constraint recipe_generations_pet_user_fk foreign key (pet_profile_id, user_id) references public.pet_profiles(id, user_id) on delete cascade,
  constraint recipe_generations_type_check check (recipe_type in ('personalizada', 'chef')),
  constraint recipe_generations_ingredients_array_check check (jsonb_typeof(ingredients) = 'array'),
  constraint recipe_generations_steps_array_check check (jsonb_typeof(steps) = 'array')
);

create index if not exists recipe_generations_user_id_idx on public.recipe_generations(user_id);
create index if not exists recipe_generations_pet_profile_id_idx on public.recipe_generations(pet_profile_id);
create index if not exists recipe_generations_created_at_idx on public.recipe_generations(created_at desc);

drop trigger if exists set_recipe_generations_updated_at on public.recipe_generations;
create trigger set_recipe_generations_updated_at
before update on public.recipe_generations
for each row execute function public.set_updated_at();

create table if not exists public.saved_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_profile_id uuid not null references public.pet_profiles(id) on delete cascade,
  recipe_generation_id uuid,
  history_key text not null,
  title text not null default '',
  recipe_type text not null,
  ingredients jsonb not null default '[]'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint saved_recipes_pet_user_fk foreign key (pet_profile_id, user_id) references public.pet_profiles(id, user_id) on delete cascade,
  constraint saved_recipes_generation_user_fk foreign key (recipe_generation_id, user_id) references public.recipe_generations(id, user_id) on delete set null (recipe_generation_id),
  constraint saved_recipes_type_check check (recipe_type in ('personalizada', 'chef')),
  constraint saved_recipes_ingredients_array_check check (jsonb_typeof(ingredients) = 'array'),
  constraint saved_recipes_steps_array_check check (jsonb_typeof(steps) = 'array'),
  constraint saved_recipes_unique_history_key unique (user_id, history_key)
);

create index if not exists saved_recipes_user_id_idx on public.saved_recipes(user_id);
create index if not exists saved_recipes_pet_profile_id_idx on public.saved_recipes(pet_profile_id);
create index if not exists saved_recipes_created_at_idx on public.saved_recipes(created_at desc);

create table if not exists public.weekly_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_profile_id uuid not null references public.pet_profiles(id) on delete cascade,
  plan_mode text not null,
  title text not null default 'Plano semanal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_plans_id_user_id_unique unique (id, user_id),
  constraint weekly_plans_pet_user_fk foreign key (pet_profile_id, user_id) references public.pet_profiles(id, user_id) on delete cascade,
  constraint weekly_plans_mode_check check (plan_mode in ('auto', 'custom'))
);

create index if not exists weekly_plans_user_id_idx on public.weekly_plans(user_id);
create index if not exists weekly_plans_pet_profile_id_idx on public.weekly_plans(pet_profile_id);
create index if not exists weekly_plans_created_at_idx on public.weekly_plans(created_at desc);

drop trigger if exists set_weekly_plans_updated_at on public.weekly_plans;
create trigger set_weekly_plans_updated_at
before update on public.weekly_plans
for each row execute function public.set_updated_at();

create table if not exists public.weekly_plan_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weekly_plan_id uuid not null references public.weekly_plans(id) on delete cascade,
  day_index integer not null,
  day_name text not null,
  title text not null default '',
  ingredients jsonb not null default '[]'::jsonb,
  prep text not null default '',
  image_url text,
  profile_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint weekly_plan_days_plan_user_fk foreign key (weekly_plan_id, user_id) references public.weekly_plans(id, user_id) on delete cascade,
  constraint weekly_plan_days_day_index_check check (day_index between 0 and 6),
  constraint weekly_plan_days_ingredients_array_check check (jsonb_typeof(ingredients) = 'array'),
  constraint weekly_plan_days_unique_day unique (weekly_plan_id, day_index)
);

create index if not exists weekly_plan_days_user_id_idx on public.weekly_plan_days(user_id);
create index if not exists weekly_plan_days_weekly_plan_id_idx on public.weekly_plan_days(weekly_plan_id);

alter table public.pet_profiles enable row level security;
alter table public.pet_blocked_ingredients enable row level security;
alter table public.recipe_generations enable row level security;
alter table public.saved_recipes enable row level security;
alter table public.weekly_plans enable row level security;
alter table public.weekly_plan_days enable row level security;

drop policy if exists "Users can read own pet profiles" on public.pet_profiles;
create policy "Users can read own pet profiles"
on public.pet_profiles for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own pet profiles" on public.pet_profiles;
create policy "Users can insert own pet profiles"
on public.pet_profiles for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own pet profiles" on public.pet_profiles;
create policy "Users can update own pet profiles"
on public.pet_profiles for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own pet profiles" on public.pet_profiles;
create policy "Users can delete own pet profiles"
on public.pet_profiles for delete
using (auth.uid() = user_id);

drop policy if exists "Users can manage own blocked ingredients" on public.pet_blocked_ingredients;
create policy "Users can manage own blocked ingredients"
on public.pet_blocked_ingredients for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own recipe generations" on public.recipe_generations;
create policy "Users can manage own recipe generations"
on public.recipe_generations for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own saved recipes" on public.saved_recipes;
create policy "Users can manage own saved recipes"
on public.saved_recipes for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own weekly plans" on public.weekly_plans;
create policy "Users can manage own weekly plans"
on public.weekly_plans for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own weekly plan days" on public.weekly_plan_days;
create policy "Users can manage own weekly plan days"
on public.weekly_plan_days for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
