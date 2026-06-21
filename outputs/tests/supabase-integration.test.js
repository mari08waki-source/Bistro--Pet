import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("frontend integration contains every BistroPet Supabase table", () => {
  const storage = read("bistropet-storage.js");
  [
    "pet_profiles",
    "pet_blocked_ingredients",
    "recipe_generations",
    "saved_recipes",
    "weekly_plans",
    "weekly_plan_days"
  ].forEach(table => assert.match(storage, new RegExp(`from\\(\\\"${table}\\\"\\)`)));
});

test("authentication implements signup, login, recovery and session isolation", () => {
  const client = read("bistropet-supabase.js");
  assert.match(client, /signUp\(/);
  assert.match(client, /signInWithPassword/);
  assert.match(client, /resetPasswordForEmail/);
  assert.match(client, /updateUser\(\{ password \}\)/);
  assert.match(client, /storage: authStorage\(\)/);
  assert.doesNotMatch(client, /service_role|SERVICE_ROLE/);
});

test("active frontend no longer uses localStorage", () => {
  [
    "index.html",
    "session-2-pet-profile.html",
    "session-3-meal.html",
    "session-4-weekly-plan.html",
    "bistropet-storage.js",
    "bistropet-supabase.js",
    "admin/admin.js"
  ].forEach(file => assert.doesNotMatch(read(file), /localStorage/, file));
});

test("demonstration credentials were removed from login", () => {
  const index = read("index.html");
  assert.doesNotMatch(index, /tutora@bistropet\.app|value=\"premium\"/);
  assert.match(index, /id=\"authEmail\"/);
  assert.match(index, /id=\"authPassword\"/);
});

test("RLS remains enabled for all six application tables", () => {
  const schema = read("supabase/001_initial_schema.sql");
  assert.equal((schema.match(/enable row level security/g) || []).length, 6);
  assert.equal((schema.match(/^create policy /gm) || []).length, 9);
  assert.match(schema, /auth\.uid\(\) = user_id/);
});
