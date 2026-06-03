(function () {
  const PROFILE_KEY = "bistropet:pet-profile";
  const RECIPE_KEY = "bistropet:last-recipe";
  const WEEKLY_PLAN_KEY = "bistropet:weekly-plan";

  const defaultProfile = {
    name: "Luna",
    size: "médio",
    age: "7 anos",
    weight: "12 kg",
    preferences: "Gosta de arroz. Prefere refeições mornas. Ama frango.",
    restrictions: "cebola, alho, uva, chocolate",
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

  function getPetProfile() {
    return Object.assign({}, defaultProfile, readJson(PROFILE_KEY, {}));
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

  window.BistroPetStorage = {
    getPetProfile,
    savePetProfile,
    getLastRecipe,
    saveLastRecipe,
    getWeeklyPlan,
    saveWeeklyPlan
  };
})();
