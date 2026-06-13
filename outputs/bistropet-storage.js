(function () {
  const PROFILE_KEY = "bistropet:pet-profile";
  const RECIPE_KEY = "bistropet:last-recipe";
  const RECIPE_HISTORY_KEY = "bistropet:manual-recipe-history";
  const WEEKLY_PLAN_KEY = "bistropet:weekly-plan";
  const GLOBAL_BLOCKED_KEY = "bistropet:global-blocked-ingredients";
  const PROFILE_SCHEMA_VERSION = 2;

  const defaultProfile = {
    name: "",
    size: "",
    age: "",
    weight: "",
    menuStyle: "livre",
    preferences: "",
    restrictions: "",
    notes: "",
    schemaVersion: PROFILE_SCHEMA_VERSION,
    revision: 0,
    updatedAt: ""
  };

  function readJson(key, fallback) {
    try {
      const value = window.localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    window.localStorage.setItem(key, JSON.stringify(value));
  }

  function clearRecipeSessionState() {
    [
      "bistropet:session3:free",
      "bistropet:session3:special",
      "bistropet:session3:blocked",
      "bistropet:session3:index"
    ].forEach(key => window.sessionStorage.removeItem(key));
  }

  function normalize(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

  function splitList(value) {
    return String(value || "")
      .split(/[,.;\n]/)
      .map(item => item.trim().replace(/\s+/g, " "))
      .filter(Boolean);
  }

  function sameIngredient(a, b) {
    const left = normalize(a);
    const right = normalize(b);
    return Boolean(left && right && left === right);
  }

  function uniqueItems(items) {
    const result = [];
    items.forEach(item => {
      const clean = String(item || "").trim().replace(/\s+/g, " ");
      if (clean && !result.some(existing => sameIngredient(existing, clean))) result.push(clean);
    });
    return result;
  }

  function uniqueRestrictionLabels(items) {
    const result = [];
    items.forEach(item => {
      const clean = String(item || "").trim().replace(/\s+/g, " ");
      if (clean && !result.some(existing => normalize(existing) === normalize(clean))) result.push(clean);
    });
    return result;
  }

  function extractFoodRestrictions(value) {
    const removeInstruction = item => String(item || "")
      .replace(/^.*?\b(?:n[aã]o pode comer|n[aã]o utilizar|al[eé]rgico a|restri[cç][aã]o a)\b\s*/i, "")
      .trim();
    return uniqueRestrictionLabels(splitList(value)
      .flatMap(item => removeInstruction(item).split(/\s+e\s+/i))
      .map(item => item.trim())
      .filter(Boolean));
  }

  function canonicalProfile(value) {
    const profile = Object.assign({}, defaultProfile, value || {});
    profile.notes = profile.menuStyle === "personalizada" ? String(profile.notes || "").trim() : "";
    profile.restrictions = extractFoodRestrictions(profile.notes).join(", ");
    profile.schemaVersion = PROFILE_SCHEMA_VERSION;
    profile.revision = Number(profile.revision || 0);
    profile.updatedAt = String(profile.updatedAt || "");
    delete profile.noteRestrictions;
    return profile;
  }

  function getPetProfile() {
    const storedProfile = readJson(PROFILE_KEY, {});
    const profile = canonicalProfile(storedProfile);
    const needsMigration = storedProfile.schemaVersion !== PROFILE_SCHEMA_VERSION
      || storedProfile.restrictions !== profile.restrictions
      || Object.prototype.hasOwnProperty.call(storedProfile, "noteRestrictions");
    if (needsMigration) {
      profile.revision += 1;
      profile.updatedAt = new Date().toISOString();
      writeJson(PROFILE_KEY, profile);
      window.localStorage.removeItem(GLOBAL_BLOCKED_KEY);
      window.localStorage.removeItem(RECIPE_KEY);
      window.localStorage.removeItem(WEEKLY_PLAN_KEY);
      clearRecipeSessionState();
    }
    return profile;
  }

  function savePetProfile(profile) {
    const currentProfile = getPetProfile();
    const incomingProfile = Object.assign({}, currentProfile, profile);
    const nextProfile = canonicalProfile(incomingProfile);
    nextProfile.revision = currentProfile.revision + 1;
    nextProfile.updatedAt = new Date().toISOString();
    writeJson(PROFILE_KEY, nextProfile);
    window.localStorage.removeItem(GLOBAL_BLOCKED_KEY);
    window.localStorage.removeItem(RECIPE_KEY);
    window.localStorage.removeItem(WEEKLY_PLAN_KEY);
    clearRecipeSessionState();
    return nextProfile;
  }

  function getOfficialRestrictions() {
    const profile = getPetProfile();
    return extractFoodRestrictions(profile.notes);
  }

  function getLastRecipe() {
    return readJson(RECIPE_KEY, null);
  }

  function saveLastRecipe(recipe) {
    writeJson(RECIPE_KEY, recipe);
    return recipe;
  }

  function getRecipeHistory() {
    const history = readJson(RECIPE_HISTORY_KEY, []);
    return Array.isArray(history) ? history : [];
  }

  function addRecipeToHistory(recipe) {
    const history = getRecipeHistory();
    const historyKey = JSON.stringify([
      recipe.mode,
      recipe.title,
      recipe.ingredients || [],
      recipe.steps || []
    ]);
    const existing = history.find(item => item.historyKey === historyKey);
    if (existing) return existing;
    const entry = {
      historyId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      historyKey,
      createdAt: new Date().toISOString(),
      title: recipe.title,
      mode: recipe.mode,
      ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
      steps: Array.isArray(recipe.steps) ? recipe.steps : []
    };
    writeJson(RECIPE_HISTORY_KEY, [entry, ...history]);
    return entry;
  }

  function getWeeklyPlan() {
    return readJson(WEEKLY_PLAN_KEY, null);
  }

  function saveWeeklyPlan(plan) {
    writeJson(WEEKLY_PLAN_KEY, plan);
    return plan;
  }

  function getGlobalBlockedIngredients() {
    return uniqueItems(readJson(GLOBAL_BLOCKED_KEY, []));
  }

  function saveGlobalBlockedIngredients(items) {
    const blockedItems = uniqueItems(Array.isArray(items) ? items : []);
    if (blockedItems.length) writeJson(GLOBAL_BLOCKED_KEY, blockedItems);
    else window.localStorage.removeItem(GLOBAL_BLOCKED_KEY);
    return blockedItems;
  }

  window.BistroPetStorage = {
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
    saveGlobalBlockedIngredients
  };
})();

