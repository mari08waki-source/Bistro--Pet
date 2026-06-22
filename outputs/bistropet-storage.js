(function () {
  "use strict";

  const PROFILE_SCHEMA_VERSION = 3;
  const defaultProfile = {
    name: "",
    tutor: "",
    size: "",
    age: "",
    weight: "",
    menuStyle: "padrao",
    notes: "",
    schemaVersion: PROFILE_SCHEMA_VERSION,
    revision: 0,
    updatedAt: ""
  };

  const cache = {
    user: null,
    profileId: null,
    profile: { ...defaultProfile },
    hasProfile: false,
    officialRestrictions: [],
    globalBlockedIngredients: [],
    lastRecipe: null,
    recipeHistory: [],
    weeklyPlan: null
  };
  let readyPromise;

  function clearSessionState() {
    cache.user = null;
    cache.profileId = null;
    cache.profile = { ...defaultProfile };
    cache.hasProfile = false;
    cache.officialRestrictions = [];
    cache.globalBlockedIngredients = [];
    cache.lastRecipe = null;
    cache.recipeHistory = [];
    cache.weeklyPlan = null;
    readyPromise = undefined;
  }

  function normalize(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

  function normalizeObservationText(value) {
    return String(value || "")
      .replace(/[\u200B-\u200D\u2060\uFEFF]+/g, "\n")
      .replace(/\u00A0/g, " ")
      .replace(/\s*[,;]\s*/g, "\n")
      .replace(/\n[ \t]+|[ \t]+\n/g, "\n")
      .replace(/\n{2,}/g, "\n")
      .trim();
  }

  function sameIngredient(a, b) {
    const left = normalize(a);
    const right = normalize(b);
    return Boolean(left && right && left === right);
  }

  function uniqueItems(items) {
    const result = [];
    (Array.isArray(items) ? items : []).forEach(item => {
      const clean = String(item || "").trim().replace(/\s+/g, " ");
      if (clean && !result.some(existing => sameIngredient(existing, clean))) result.push(clean);
    });
    return result;
  }

  const observationFoodAliases = {
    mandioquinha: "mandioquinha", beterraba: "beterraba", abobrinha: "abobrinha",
    mandioca: "mandioca", cenora: "cenoura", cenoura: "cenoura", batata: "batata",
    frango: "frango", chuchu: "chuchu", carne: "carne", peixe: "peixe",
    tilapia: "tilapia", salmao: "salmao", arroz: "arroz", milho: "milho",
    inhame: "inhame", pepino: "pepino", vagem: "vagem", couve: "couve",
    selga: "selga", acelga: "acelga", quinoa: "quinoa", aveia: "aveia",
    abobora: "abobora", peru: "peru", ovo: "ovo"
  };

  function splitKnownFoodWords(value) {
    const original = String(value || "").trim();
    const words = normalize(original).split(/\s+/).filter(Boolean);
    if (words.length < 2 || !words.every(word => observationFoodAliases[word])) return [original];
    return words.map(word => observationFoodAliases[word]);
  }

  function extractFoodRestrictions(value) {
    const removeInstruction = item => String(item || "")
      .replace(/^.*?\b(?:n[aã]o pode comer|n[aã]o utilizar|al[eé]rgico a|restri[cç][aã]o a)\b\s*/i, "")
      .trim();
    return uniqueItems(normalizeObservationText(value)
      .split(/[,.;\n]/)
      .flatMap(item => removeInstruction(item).split(/\s+e\s+/i))
      .flatMap(splitKnownFoodWords)
      .map(item => observationFoodAliases[normalize(item)] || item)
      .map(item => item.trim())
      .filter(Boolean));
  }

  function canonicalProfile(value) {
    const source = Object.assign({}, defaultProfile, value || {});
    const profile = {
      name: String(source.name || ""),
      tutor: String(source.tutor || ""),
      size: String(source.size || ""),
      age: String(source.age || ""),
      weight: String(source.weight || ""),
      menuStyle: source.menuStyle === "personalizada" ? "personalizada" : "padrao",
      notes: String(source.notes || ""),
      schemaVersion: PROFILE_SCHEMA_VERSION,
      revision: Number(source.revision || 0),
      updatedAt: String(source.updatedAt || "")
    };
    profile.notes = profile.menuStyle === "personalizada" ? normalizeObservationText(profile.notes) : "";
    return profile;
  }

  function profileFromRow(row) {
    if (!row) return { ...defaultProfile };
    return canonicalProfile({
      name: row.pet_name,
      tutor: row.tutor_name,
      age: row.age_text,
      weight: row.weight_text,
      size: row.size_text,
      menuStyle: row.menu_style,
      notes: row.notes,
      schemaVersion: row.schema_version,
      revision: row.revision,
      updatedAt: row.updated_at
    });
  }

  function recipeFromGeneration(row) {
    if (!row) return null;
    return {
      _generationId: row.id,
      title: row.title,
      description: row.description,
      mode: row.recipe_type,
      ingredients: Array.isArray(row.ingredients) ? row.ingredients : [],
      steps: Array.isArray(row.steps) ? row.steps : [],
      image: row.image_url || "",
      requestId: row.request_id || "",
      createdAt: row.created_at
    };
  }

  function recipeFromSaved(row) {
    return {
      historyId: row.id,
      historyKey: row.history_key,
      _generationId: row.recipe_generation_id || null,
      title: row.title,
      mode: row.recipe_type,
      ingredients: Array.isArray(row.ingredients) ? row.ingredients : [],
      steps: Array.isArray(row.steps) ? row.steps : [],
      createdAt: row.created_at
    };
  }

  async function loadWeeklyPlan(client, userId) {
    const { data: plan, error: planError } = await client
      .from("weekly_plans")
      .select("id, plan_mode, title, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (planError) throw planError;
    if (!plan) return null;

    const { data: days, error: daysError } = await client
      .from("weekly_plan_days")
      .select("id, day_index, day_name, title, ingredients, prep, note, image_url, profile_snapshot")
      .eq("weekly_plan_id", plan.id)
      .order("day_index", { ascending: true });
    if (daysError) throw daysError;
    return (days || []).map(row => ({
      _dayId: row.id,
      _planId: plan.id,
      day: row.day_name,
      planMode: plan.plan_mode,
      planModeLabel: plan.plan_mode === "custom" ? "Personalizado" : "Automático",
      title: row.title,
      ingredients: Array.isArray(row.ingredients) ? row.ingredients : [],
      prep: row.prep,
      note: row.note,
      customNote: "",
      image: row.image_url || "",
      profile: row.profile_snapshot || {}
    }));
  }

  async function loadAll() {
    const client = await window.BistroPetSupabase.ready();
    const user = await window.BistroPetSupabase.sessionUser();
    if (!user) return false;
    cache.user = user;

    const [profileResult, blockedResult, generationResult, historyResult, weeklyPlan] = await Promise.all([
      client.from("pet_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      client.from("pet_blocked_ingredients").select("ingredient_name, source").eq("user_id", user.id),
      client.from("recipe_generations").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      client.from("saved_recipes").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      loadWeeklyPlan(client, user.id)
    ]);

    [profileResult.error, blockedResult.error, generationResult.error, historyResult.error].filter(Boolean).forEach(error => { throw error; });
    cache.hasProfile = Boolean(profileResult.data);
    cache.profileId = profileResult.data?.id || null;
    cache.profile = profileFromRow(profileResult.data);
    cache.officialRestrictions = uniqueItems((blockedResult.data || []).filter(row => row.source === "profile_observation").map(row => row.ingredient_name));
    cache.globalBlockedIngredients = uniqueItems((blockedResult.data || []).filter(row => row.source === "manual_recipe").map(row => row.ingredient_name));
    cache.lastRecipe = recipeFromGeneration(generationResult.data);
    cache.recipeHistory = (historyResult.data || []).map(recipeFromSaved);
    cache.weeklyPlan = weeklyPlan;
    return true;
  }

  function ready(force = false) {
    if (force || !readyPromise) readyPromise = loadAll();
    return readyPromise;
  }

  async function requireReady() {
    const loaded = await ready();
    if (!loaded) throw new Error("Sessão não autenticada.");
    return window.BistroPetSupabase.ready();
  }

  function getPetProfile() { return { ...cache.profile }; }
  function hasPetProfile() { return cache.hasProfile; }
  function getOfficialRestrictions() { return [...cache.officialRestrictions]; }
  function getGlobalBlockedIngredients() { return [...cache.globalBlockedIngredients]; }
  function getLastRecipe() { return cache.lastRecipe ? { ...cache.lastRecipe } : null; }
  function getRecipeHistory() { return cache.recipeHistory.map(item => ({ ...item })); }
  function getWeeklyPlan() { return Array.isArray(cache.weeklyPlan) ? cache.weeklyPlan.map(item => ({ ...item })) : null; }
  function getCurrentUser() { return cache.user; }

  async function replaceBlockedSource(client, source, items) {
    const { error: deleteError } = await client
      .from("pet_blocked_ingredients")
      .delete()
      .eq("user_id", cache.user.id)
      .eq("source", source);
    if (deleteError) throw deleteError;
    const cleanItems = uniqueItems(items);
    if (!cleanItems.length) return cleanItems;
    const rows = cleanItems.map(ingredientName => ({
      user_id: cache.user.id,
      pet_profile_id: cache.profileId,
      ingredient_name: ingredientName,
      source
    }));
    const { error: insertError } = await client.from("pet_blocked_ingredients").insert(rows);
    if (insertError) throw insertError;
    return cleanItems;
  }

  async function savePetProfile(value) {
    const client = await requireReady();
    const profile = canonicalProfile(value);
    profile.revision = Number(cache.profile.revision || 0) + 1;
    profile.updatedAt = new Date().toISOString();
    const payload = {
      user_id: cache.user.id,
      pet_name: profile.name,
      tutor_name: profile.tutor,
      age_text: profile.age,
      weight_text: profile.weight,
      size_text: profile.size,
      menu_style: profile.menuStyle,
      notes: profile.notes,
      schema_version: PROFILE_SCHEMA_VERSION,
      revision: profile.revision,
      updated_at: profile.updatedAt
    };
    const { data, error } = await client
      .from("pet_profiles")
      .upsert(payload, { onConflict: "user_id" })
      .select("*")
      .single();
    if (error) throw error;
    cache.profileId = data.id;
    cache.hasProfile = true;
    cache.profile = profileFromRow(data);
    cache.officialRestrictions = await replaceBlockedSource(client, "profile_observation", extractFoodRestrictions(cache.profile.notes));
    return getPetProfile();
  }

  async function saveGlobalBlockedIngredients(items) {
    const client = await requireReady();
    if (!cache.profileId) throw new Error("Salve o perfil do pet antes dos alimentos proibidos.");
    cache.globalBlockedIngredients = await replaceBlockedSource(client, "manual_recipe", items);
    return getGlobalBlockedIngredients();
  }

  async function saveLastRecipe(recipe) {
    const client = await requireReady();
    if (!cache.profileId) throw new Error("Perfil do pet não encontrado.");
    const payload = {
      user_id: cache.user.id,
      pet_profile_id: cache.profileId,
      recipe_type: recipe.mode,
      title: String(recipe.title || ""),
      description: String(recipe.description || ""),
      ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
      steps: Array.isArray(recipe.steps) ? recipe.steps : [],
      image_url: recipe.image || null,
      request_id: recipe.requestId || null,
      updated_at: new Date().toISOString()
    };
    let result;
    if (recipe._generationId) {
      result = await client.from("recipe_generations").update(payload).eq("id", recipe._generationId).eq("user_id", cache.user.id).select("*").single();
    } else {
      result = await client.from("recipe_generations").insert(payload).select("*").single();
    }
    if (result.error) throw result.error;
    cache.lastRecipe = recipeFromGeneration(result.data);
    Object.assign(recipe, cache.lastRecipe);
    return getLastRecipe();
  }

  async function addRecipeToHistory(recipe) {
    const client = await requireReady();
    if (!cache.profileId) throw new Error("Perfil do pet não encontrado.");
    const historyKey = JSON.stringify([recipe.mode, recipe.title, recipe.ingredients || [], recipe.steps || []]);
    const payload = {
      user_id: cache.user.id,
      pet_profile_id: cache.profileId,
      recipe_generation_id: recipe._generationId || null,
      history_key: historyKey,
      title: String(recipe.title || ""),
      recipe_type: recipe.mode,
      ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
      steps: Array.isArray(recipe.steps) ? recipe.steps : []
    };
    const { data, error } = await client
      .from("saved_recipes")
      .upsert(payload, { onConflict: "user_id,history_key" })
      .select("*")
      .single();
    if (error) throw error;
    const saved = recipeFromSaved(data);
    cache.recipeHistory = [saved, ...cache.recipeHistory.filter(item => item.historyId !== saved.historyId && item.historyKey !== saved.historyKey)];
    return { ...saved };
  }

  async function saveWeeklyPlan(plan) {
    const client = await requireReady();
    const { error: deleteError } = await client.from("weekly_plans").delete().eq("user_id", cache.user.id);
    if (deleteError) throw deleteError;
    if (!Array.isArray(plan) || !plan.length) {
      cache.weeklyPlan = null;
      return null;
    }
    if (!cache.profileId) throw new Error("Perfil do pet não encontrado.");
    const planMode = plan[0]?.planMode === "custom" ? "custom" : "auto";
    const { data: savedPlan, error: planError } = await client
      .from("weekly_plans")
      .insert({
        user_id: cache.user.id,
        pet_profile_id: cache.profileId,
        plan_mode: planMode,
        title: "Plano semanal"
      })
      .select("id")
      .single();
    if (planError) throw planError;
    const rows = plan.map((item, index) => ({
      user_id: cache.user.id,
      weekly_plan_id: savedPlan.id,
      day_index: index,
      day_name: String(item.day || ""),
      title: String(item.title || ""),
      ingredients: Array.isArray(item.ingredients) ? item.ingredients : [],
      prep: String(item.prep || ""),
      note: String(item.note || ""),
      image_url: item.image || null,
      profile_snapshot: item.profile || {}
    }));
    const { error: daysError } = await client.from("weekly_plan_days").insert(rows);
    if (daysError) throw daysError;
    cache.weeklyPlan = plan.map((item, index) => ({ ...item, _planId: savedPlan.id, planMode }));
    return getWeeklyPlan();
  }

  async function clearAllData() {
    const client = await requireReady();
    for (const table of ["weekly_plans", "saved_recipes", "recipe_generations", "pet_blocked_ingredients", "pet_profiles"]) {
      const { error } = await client.from(table).delete().eq("user_id", cache.user.id);
      if (error) throw error;
    }
    cache.profileId = null;
    cache.profile = { ...defaultProfile };
    cache.hasProfile = false;
    cache.officialRestrictions = [];
    cache.globalBlockedIngredients = [];
    cache.lastRecipe = null;
    cache.recipeHistory = [];
    cache.weeklyPlan = null;
  }

  window.BistroPetStorage = {
    ready,
    refresh: () => ready(true),
    getCurrentUser,
    hasPetProfile,
    getPetProfile,
    savePetProfile,
    extractFoodRestrictions,
    getOfficialRestrictions,
    getLastRecipe,
    saveLastRecipe,
    getRecipeHistory,
    addRecipeToHistory,
    getWeeklyPlan,
    saveWeeklyPlan,
    getGlobalBlockedIngredients,
    saveGlobalBlockedIngredients,
    clearAllData,
    clearSessionState
  };

  window.addEventListener("bistropet:session-cleared", clearSessionState);
})();
