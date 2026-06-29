import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

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

test("profile observations split known foods separated only by spaces", () => {
  const context = { window: { addEventListener() {} } };
  vm.runInNewContext(read("bistropet-storage.js"), context);
  const restrictions = context.window.BistroPetStorage.extractFoodRestrictions("cenora carne");
  assert.deepEqual([...restrictions, "peixe"], ["cenoura", "carne", "peixe"]);
  assert.deepEqual([...context.window.BistroPetStorage.extractFoodRestrictions("batata doce")], ["batata doce"]);
  assert.match(read("bistropet-storage.js"), /parsedProfileRestrictions\.length \? parsedProfileRestrictions : storedOfficialRestrictions/);
});

test("profile textarea is not rewritten while the user is typing", () => {
  const profile = read("session-2-pet-profile.html");
  assert.doesNotMatch(profile, /observationField\.value = savedProfile\.notes/);
  assert.doesNotMatch(profile, /observationField\.addEventListener\("input"/);
  assert.match(profile, /notes: customProfile\.checked \? String\(data\.get\("notes"\)/);
});

test("paid plan business rules are enforced in storage layer", () => {
  const storage = read("bistropet-storage.js");
  const meal = read("session-3-meal.html");
  assert.match(storage, /function recipeUsageStatus\(mode\)/);
  assert.match(storage, /\.eq\("recipe_type", "chef"\)[\s\S]*?\.gte\("created_at", startOfDayIso\(\)\)/);
  assert.match(storage, /\.eq\("recipe_type", "personalizada"\)[\s\S]*?\.gte\("created_at", startOfWeekIso\(\)\)/);
  assert.match(storage, /allowed: !data/);
  assert.match(storage, /recipe\.mode === "personalizada" \? usage\.existingId : null/);
  assert.match(storage, /customRecipeWeekly/);
  assert.match(storage, /\.gte\("created_at", historyCutoffIso\(\)\)/);
  assert.match(meal, /window\.BistroPetStorage\.recipeUsageStatus\(activeRecipeMode\)/);
  assert.doesNotMatch(meal, /usage\.existingRecipe/);
  assert.doesNotMatch(meal, /chefImageRetry/);
  assert.match(meal, /showWarning\(activeRecipeMode, usage\.message/);
});

test("V1 product rule keeps one pet profile per user", () => {
  const schema = read("supabase/001_initial_schema.sql");
  const adminDocs = read("admin/README.md");
  assert.match(schema, /constraint pet_profiles_one_profile_per_user unique \(user_id\)/);
  assert.match(adminDocs, /Regra oficial da V1: cada usuário possui 1 único perfil de pet ativo\./);
  assert.doesNotMatch(adminDocs, /2 perfis|dois perfis|liberar 2|alteração no Supabase/i);
});

test("weekly saved plans are revalidated ingredient by ingredient", () => {
  const weekly = read("session-4-weekly-plan.html");
  assert.match(weekly, /function weeklyRestrictionKey\(value\)/);
  assert.match(weekly, /\\b\(mandioca\|aipim\|macaxeira\)\\b/);
  assert.match(weekly, /const recipeItems = uniqueIngredients\(\[/);
  assert.match(weekly, /recipeItems\.some\(ingredient => isRestricted\(ingredient, restrictions\)\)/);
  assert.doesNotMatch(weekly, /const text = `\$\{item\.title \|\| ""\} \$\{\(item\.ingredients \|\| \[\]\)\.join\(" "\)\}`/);
  assert.match(weekly, /await clearWeeklyPlanState\(Boolean\(savedPlan\)\)/);
});

test("weekly reload discards a saved plan that contains blocked mandioca", async () => {
  const weekly = read("session-4-weekly-plan.html");
  const script = weekly.match(/<script>\s*([\s\S]*?)\s*<\/script>\s*<script src="\.\/pwa\.js"><\/script>/)[1];
  const savedPlan = Array.from({ length: 7 }, (_, index) => ({
    day: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"][index],
    planMode: "custom",
    title: index === 4 ? "Frango com mandioca e cenoura" : "Frango com arroz e cenoura",
    ingredients: index === 4 ? ["Frango", "Mandioca", "Cenoura"] : ["Frango", "Arroz", "Cenoura"],
    prep: "Teste.",
    image: "",
    profile: { name: "Luna" }
  }));
  const saveCalls = [];
  const element = id => ({
    id,
    checked: id === "weeklyAuto",
    hidden: false,
    disabled: false,
    innerHTML: "",
    textContent: "",
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    querySelectorAll() { return []; },
    querySelector() { return element(`${id}:child`); },
    setAttribute() {},
    showModal() {},
    close() {}
  });
  const document = {
    getElementById: element,
    querySelector: () => element("query"),
    querySelectorAll: () => []
  };
  const context = {
    document,
    fetch: async () => ({ ok: false, json: async () => ({}) }),
    alert(message) { throw new Error(String(message)); },
    window: {
      location: { protocol: "https:", replace(value) { this.replaced = value; } },
      sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
      BistroPetAccessibility: { stop() {} },
      BistroPetSupabase: { authHeaders: async headers => headers },
      BistroPetStorage: {
        ready: async () => true,
        getPetProfile: () => ({ name: "Luna", age: "3 anos", weight: "12 kg", size: "medio" }),
        getOfficialRestrictions: () => ["mandioca"],
        getGlobalBlockedIngredients: () => [],
        getWeeklyPlan: () => savedPlan,
        saveWeeklyPlan: async value => { saveCalls.push(value); return value; }
      }
    }
  };
  context.window.window = context.window;
  context.window.document = document;
  vm.runInNewContext(script, context);
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.ok(saveCalls.some(value => value === null));
});

test("weekly custom plan generation avoids blocked mandioca family", async () => {
  const weekly = read("session-4-weekly-plan.html");
  const script = weekly.match(/<script>\s*([\s\S]*?)\s*<\/script>\s*<script src="\.\/pwa\.js"><\/script>/)[1];
  const saveCalls = [];
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        checked: id === "weeklyCustom",
        hidden: false,
        disabled: false,
        innerHTML: "",
        textContent: "",
        listeners: {},
        classList: { add() {}, remove() {}, toggle() {} },
        addEventListener(event, callback) { this.listeners[event] = callback; },
        querySelectorAll() { return []; },
        querySelector() { return element(`${id}:child`); },
        setAttribute() {},
        showModal() {},
        close() {}
      });
    }
    return elements.get(id);
  };
  const document = {
    getElementById: element,
    querySelector: () => element("query"),
    querySelectorAll: () => []
  };
  const context = {
    document,
    fetch: async () => ({ ok: false, json: async () => ({}) }),
    alert(message) { throw new Error(String(message)); },
    window: {
      location: { protocol: "https:", replace(value) { this.replaced = value; } },
      sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
      BistroPetAccessibility: { stop() {} },
      BistroPetSupabase: { authHeaders: async headers => headers },
      BistroPetStorage: {
        ready: async () => true,
        getPetProfile: () => ({ name: "Luna", age: "3 anos", weight: "12 kg", size: "medio" }),
        getOfficialRestrictions: () => ["mandioca"],
        getGlobalBlockedIngredients: () => [],
        getWeeklyPlan: () => null,
        saveWeeklyPlan: async value => { saveCalls.push(value); return value; }
      }
    }
  };
  context.window.window = context.window;
  context.window.document = document;
  vm.runInNewContext(script, context);
  await new Promise(resolve => setTimeout(resolve, 25));
  await element("createWeekPlan").listeners.click();
  const generatedPlan = saveCalls.find(value => Array.isArray(value) && value.length === 7);
  assert.ok(generatedPlan);
  const allIngredients = generatedPlan.flatMap(item => item.ingredients || []).map(item => String(item).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase());
  assert.ok(!allIngredients.some(item => /\b(mandioca|aipim|macaxeira)\b/.test(item)));
});

test("authentication implements signup, login, recovery and session isolation", () => {
  const client = read("bistropet-supabase.js");
  assert.match(client, /signUp\(/);
  assert.match(client, /data\.user\.identities/);
  assert.match(client, /identities\.length === 0/);
  assert.match(client, /signInWithPassword/);
  assert.match(client, /resetPasswordForEmail/);
  assert.match(client, /updateUser\(\{ password \}\)/);
  assert.match(client, /storage: authStorage\(\)/);
  assert.doesNotMatch(client, /service_role|SERVICE_ROLE/);
});

test("authenticated screens mount a shared logout control", () => {
  const client = read("bistropet-supabase.js");
  const styles = read("styles.css");
  assert.match(client, /mountSessionLogout\(\)/);
  assert.match(client, /\.session-two-body, \.session-three-body/);
  assert.match(client, /document\.querySelector\("\.chef-pet-card"\)/);
  assert.match(client, /petCard\.appendChild\(button\)/);
  assert.match(client, /await signOut\(\)/);
  assert.match(styles, /\.bistropet-session-logout/);
  assert.match(styles, /\.chef-pet-card\.has-session-logout/);
});

test("mobile pages keep horizontal card alignment symmetric", () => {
  const styles = read("styles.css");
  assert.match(styles, /\.profile-content\s*\{[\s\S]*?justify-items: center;/);
  assert.match(styles, /\.pet-profile-card\s*\{[\s\S]*?width: 100%;[\s\S]*?margin-inline: auto;/);
  assert.match(styles, /\.meal-session\s*\{[\s\S]*?justify-items: center;/);
  assert.match(styles, /\.chef-pet-card,[\s\S]*?\.chef-result\s*\{[\s\S]*?width: 100%;[\s\S]*?margin: 0 auto;/);
  assert.match(styles, /\.intelligent-kitchen\s*\{[\s\S]*?justify-self: center;[\s\S]*?margin: 0 auto;/);
  assert.match(styles, /\.weekly-planner\s*\{[\s\S]*?justify-self: center;[\s\S]*?margin: 0 auto;/);
  assert.doesNotMatch(styles, /\.pet-profile-card\s*\{[^}]*width: calc\(100vw - 32px\);/);
  assert.doesNotMatch(styles, /\.chef-pet-card,[^{]*\{[^}]*width: calc\(100vw - 32px\);/);
});

test("logout is local and cannot freeze indefinitely", () => {
  const client = read("bistropet-supabase.js");
  assert.match(client, /signOut\(\{ scope: \"local\" \}\)/);
  assert.match(client, /Promise\.race/);
  assert.match(client, /timedOut: true/);
  assert.match(client, /window\.sessionStorage\.removeItem/);
  assert.match(client, /bistropet:session-cleared/);
  assert.match(read("bistropet-storage.js"), /function clearSessionState\(\)/);
});

test("admin access is checked by the backend and common users are redirected", () => {
  const client = read("bistropet-supabase.js");
  const admin = read("admin/admin.js");
  assert.match(client, /fetch\(\"\/api\/admin-access\"/);
  assert.match(admin, /BistroPetSupabase\.adminAccess\(\)/);
  assert.match(admin, /window\.location\.replace\(\"\.\.\/index\.html\"\)/);
});

test("terms describe real account storage and no demonstration access", () => {
  const terms = read("terms.html");
  assert.doesNotMatch(terms, /demonstrativo|armazenados localmente|autenticacao definitiva/i);
  assert.match(terms, /infraestrutura do Bistro Pet/i);
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

test("security hardening restricts all user tables to authenticated owners", () => {
  const hardening = read("supabase/002_security_hardening.sql");
  const tables = [
    "pet_profiles",
    "pet_blocked_ingredients",
    "recipe_generations",
    "saved_recipes",
    "weekly_plans",
    "weekly_plan_days"
  ];
  tables.forEach(table => {
    assert.match(hardening, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(hardening, new RegExp(`revoke all on table public\\.${table} from public, anon`));
    assert.match(hardening, new RegExp(`grant select, insert, update, delete on table public\\.${table} to authenticated`));
  });
  assert.equal((hardening.match(/^create policy /gm) || []).length, 9);
  assert.equal((hardening.match(/to authenticated/g) || []).length, 15);
  assert.equal((hardening.match(/\(select auth\.uid\(\)\) = user_id/g) || []).length, 15);
});
