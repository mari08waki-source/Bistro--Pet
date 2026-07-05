(function () {
  "use strict";

  const imageEndpoint = window.location.protocol === "file:" ? "" : "/api/generate-recipe-image";

  function imageError(message) {
    return new Error(message || "Não foi possível gerar a imagem do prato agora.");
  }

  function normalizeIngredient(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const ingredientCategoryRules = {
    protein: [
      ["frango", ["frango", "galinha"]],
      ["peixe", ["peixe", "tilapia", "salmao", "atum", "sardinha", "merluza", "bacalhau"]],
      ["carne", ["carne", "patinho", "bovina", "bovino", "acem", "musculo", "alcatra", "coxao"]],
      ["peru", ["peru"]],
      ["ovo", ["ovo", "ovos"]]
    ],
    carbohydrate: [
      ["arroz", ["arroz"]],
      ["batata", ["batata", "batata doce"]],
      ["mandioca", ["mandioca", "aipim", "macaxeira"]],
      ["mandioquinha", ["mandioquinha", "batata baroa"]],
      ["quinoa", ["quinoa"]],
      ["inhame", ["inhame"]],
      ["aveia", ["aveia"]]
    ],
    vegetable: [
      ["cenoura", ["cenoura"]],
      ["chuchu", ["chuchu"]],
      ["abobora", ["abobora"]],
      ["abobrinha", ["abobrinha"]],
      ["pepino", ["pepino"]],
      ["vagem", ["vagem"]],
      ["beterraba", ["beterraba"]],
      ["couve", ["couve"]]
    ]
  };

  function ingredientForCategory(ingredients, category) {
    const rules = ingredientCategoryRules[category];
    for (const ingredient of ingredients) {
      const clean = normalizeIngredient(ingredient);
      const match = rules.find(([, aliases]) => aliases.some(alias => clean.includes(alias)));
      if (match) return match[0];
    }
    return "";
  }

  function simpleIngredientCombination(ingredients) {
    const items = Array.isArray(ingredients) ? ingredients : [];
    return [
      ingredientForCategory(items, "protein"),
      ingredientForCategory(items, "carbohydrate"),
      ingredientForCategory(items, "vegetable")
    ].filter(Boolean);
  }

  async function sha256Hex(parts) {
    if (!window.crypto || !window.crypto.subtle || !window.TextEncoder) return "";
    const payload = parts.map(part => String(part || "").trim().toLowerCase()).filter(Boolean).join("+");
    const bytes = new TextEncoder().encode(payload);
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
  }

  async function weeklyPlanImageCacheKey(ingredients) {
    const combination = simpleIngredientCombination(ingredients);
    return sha256Hex(["weeklyPlan:v2", ...combination]);
  }

  async function isCurrentWeeklyPlanImage({ imageUrl, ingredients }) {
    if (!imageUrl) return false;
    const cacheKey = await weeklyPlanImageCacheKey(ingredients);
    if (!cacheKey) return true;
    return String(imageUrl).includes(cacheKey);
  }

  async function requestImage(payload) {
    if (!imageEndpoint) {
      throw imageError("A imagem do prato não está disponível neste modo de visualização.");
    }
    const response = await fetch(imageEndpoint, {
      method: "POST",
      headers: await window.BistroPetSupabase.authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw imageError(data.message || "Não foi possível gerar a imagem do prato agora.");
    if (!Array.isArray(data.images)) throw imageError("A resposta da imagem veio incompleta.");
    return data.images;
  }

  async function generateRecipeImage({ generationType, recipe }) {
    const images = await requestImage({
      generationType,
      recipe: {
        id: recipe.id,
        requestId: recipe.requestId,
        recipeName: recipe.recipeName || recipe.title,
        ingredients: recipe.ingredients
      }
    });
    const image = images[0];
    if (!image || !image.imageUrl) throw imageError("A imagem do prato não foi retornada corretamente.");
    return image;
  }

  async function generateWeeklyPlanImage({ dayIndex, recipe }) {
    const images = await requestImage({
      generationType: "weeklyPlan",
      recipes: [{
        id: String(dayIndex),
        recipeName: recipe.title,
        ingredients: recipe.ingredients
      }]
    });
    const image = images.find(item => String(item.id) === String(dayIndex));
    if (!image || !image.imageUrl) throw imageError("A imagem do prato não foi retornada corretamente.");
    return image;
  }

  window.BistroPetImageService = {
    generateRecipeImage,
    generateWeeklyPlanImage,
    isCurrentWeeklyPlanImage
  };
})();
