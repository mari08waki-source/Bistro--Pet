-- BistroPet security hardening
-- Idempotent: safe to run after 001_initial_schema.sql.

begin;

alter table public.pet_profiles enable row level security;
alter table public.pet_blocked_ingredients enable row level security;
alter table public.recipe_generations enable row level security;
alter table public.saved_recipes enable row level security;
alter table public.weekly_plans enable row level security;
alter table public.weekly_plan_days enable row level security;

revoke all on table public.pet_profiles from public, anon;
revoke all on table public.pet_blocked_ingredients from public, anon;
revoke all on table public.recipe_generations from public, anon;
revoke all on table public.saved_recipes from public, anon;
revoke all on table public.weekly_plans from public, anon;
revoke all on table public.weekly_plan_days from public, anon;

grant select, insert, update, delete on table public.pet_profiles to authenticated;
grant select, insert, update, delete on table public.pet_blocked_ingredients to authenticated;
grant select, insert, update, delete on table public.recipe_generations to authenticated;
grant select, insert, update, delete on table public.saved_recipes to authenticated;
grant select, insert, update, delete on table public.weekly_plans to authenticated;
grant select, insert, update, delete on table public.weekly_plan_days to authenticated;

drop policy if exists "Users can read own pet profiles" on public.pet_profiles;
create policy "Users can read own pet profiles"
on public.pet_profiles for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own pet profiles" on public.pet_profiles;
create policy "Users can insert own pet profiles"
on public.pet_profiles for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own pet profiles" on public.pet_profiles;
create policy "Users can update own pet profiles"
on public.pet_profiles for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own pet profiles" on public.pet_profiles;
create policy "Users can delete own pet profiles"
on public.pet_profiles for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can manage own blocked ingredients" on public.pet_blocked_ingredients;
create policy "Users can manage own blocked ingredients"
on public.pet_blocked_ingredients for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage own recipe generations" on public.recipe_generations;
create policy "Users can manage own recipe generations"
on public.recipe_generations for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage own saved recipes" on public.saved_recipes;
create policy "Users can manage own saved recipes"
on public.saved_recipes for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage own weekly plans" on public.weekly_plans;
create policy "Users can manage own weekly plans"
on public.weekly_plans for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage own weekly plan days" on public.weekly_plan_days;
create policy "Users can manage own weekly plan days"
on public.weekly_plan_days for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

commit;
