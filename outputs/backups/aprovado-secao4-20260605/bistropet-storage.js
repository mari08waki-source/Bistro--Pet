(function () {
  const PROFILE_KEY = "bistropet:pet-profile";
  const RECIPE_KEY = "bistropet:last-recipe";
  const WEEKLY_PLAN_KEY = "bistropet:weekly-plan";
  const GLOBAL_BLOCKED_KEY = "bistropet:global-blocked-ingredients";

  const defaultProfile = {
    name: "Luna",
    size: "médio",
    age: "7 anos",
  weight: "12 kg",
  menuStyle: "livre",
  preferences: "Gosta de arroz. Prefere refeições mornas. Ama frango.",
    restrictions: "",
    notes: "Prefere frango. Come melhor à noite."
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
    return left && right && (left === right || left.includes(right) || right.includes(left));
  }

  function uniqueItems(items) {
    const result = [];
    items.forEach(item => {
      const clean = String(item || "").trim().replace(/\s+/g, " ");
      if (clean && !result.some(existing => sameIngredient(existing, clean))) result.push(clean);
    });
    return result;
  }

  function getPetProfile() {
    const storedProfile = readJson(PROFILE_KEY, {});
    const profile = Object.assign({}, defaultProfile, storedProfile);
    const oldGlobalItems = uniqueItems(readJson(GLOBAL_BLOCKED_KEY, []));
    if (oldGlobalItems.length && profile.restrictions) {
      profile.restrictions = splitList(profile.restrictions)
        .filter(item => !oldGlobalItems.some(globalItem => sameIngredient(item, globalItem)))
        .join(", ");
    }
    return profile;
  }

  function savePetProfile(profile) {
    const nextProfile = Object.assign({}, getPetProfile(), profile);
    writeJson(PROFILE_KEY, nextProfile);
    return nextProfile;
  }

  function getLastRecipe() {
    return readJson(RECIPE_KEY, null);
  }

  function saveLastRecipe(recipe) {
    writeJson(RECIPE_KEY, recipe);
    return recipe;
  }

  function getWeeklyPlan() {
    return readJson(WEEKLY_PLAN_KEY, null);
  }

  function saveWeeklyPlan(plan) {
    writeJson(WEEKLY_PLAN_KEY, plan);
    return plan;
  }

  function getGlobalBlockedIngredients() {
    return [];
  }

  function saveGlobalBlockedIngredients(items) {
    window.localStorage.removeItem(GLOBAL_BLOCKED_KEY);
    return [];
  }

  window.BistroPetStorage = {
    getPetProfile,
    savePetProfile,
    getLastRecipe,
    saveLastRecipe,
    getWeeklyPlan,
    saveWeeklyPlan,
    getGlobalBlockedIngredients,
    saveGlobalBlockedIngredients
  };
})();

