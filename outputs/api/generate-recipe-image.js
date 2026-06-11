import { imageCacheKey, getCachedImage, saveCachedImage } from "./_image-cache.js";
import { checkImageLimit } from "./_image-limits.js";
import { buildExactRecipeImagePrompt, buildRecipeImagePrompt, generateOpenAIRecipeImage } from "./_openai-image.js";
import { simpleIngredientCombination } from "./_ingredient-combination.js";

function sendJson(res, response, status = 200) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.status(status).json(response);
}

function normalizeRecipe(recipe) {
  return {
    id: recipe.id,
    recipeName: String(recipe.recipeName || recipe.title || "").trim(),
    requestId: String(recipe.requestId || "").trim(),
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients.map(String).filter(Boolean) : []
  };
}

function readBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");
  return {};
}

export default async function handler(request, response) {
  if (request.method === "OPTIONS") return sendJson(response, {});
  if (request.method !== "POST") return sendJson(response, { error: "Method not allowed." }, 405);

  try {
    const body = readBody(request);
    const generationType = body.generationType || "freeRecipe";
    const clientId = body.clientId || "anonymous";
    const recipes = (Array.isArray(body.recipes) ? body.recipes : [body.recipe]).filter(Boolean).map(normalizeRecipe);

    if (!recipes.length) return sendJson(response, { error: "No recipe provided." }, 400);

    if (generationType !== "weeklyPlan") {
      const results = [];
      for (const recipe of recipes) {
        const prompt = buildExactRecipeImagePrompt(recipe);
        const imageBuffer = await generateOpenAIRecipeImage({ prompt, size: "1024x1536" });
        const uniqueKey = imageCacheKey([
          generationType,
          recipe.recipeName,
          ...recipe.ingredients,
          recipe.requestId || `${Date.now()}-${Math.random()}`
        ]);
        const imageUrl = await saveCachedImage(uniqueKey, imageBuffer);
        results.push({ id: recipe.id, imageUrl, status: "ready", cached: false });
      }
      return sendJson(response, { status: "ready", images: results });
    }

    const results = [];
    const missing = [];
    const missingByCacheKey = new Map();

    for (const recipe of recipes) {
      const combination = simpleIngredientCombination(recipe.ingredients);
      const cacheKey = imageCacheKey(combination);
      const cachedUrl = await getCachedImage(cacheKey);
      if (cachedUrl) {
        results.push({ id: recipe.id, cacheKey, combination, imageUrl: cachedUrl, status: "ready", cached: true });
      } else {
        const existing = missingByCacheKey.get(cacheKey);
        if (existing) {
          existing.recipes.push(recipe);
        } else {
          const item = { recipes: [recipe], cacheKey, combination };
          missingByCacheKey.set(cacheKey, item);
          missing.push(item);
        }
      }
    }

    if (missing.length) {
      const limit = await checkImageLimit({ generationType, clientId });
      if (!limit.allowed) {
        return sendJson(response, {
          status: "limit_exceeded",
          message: "Imagem em preparo",
          limit,
          images: results
        }, 429);
      }
    }

    for (const item of missing) {
      const prompt = buildRecipeImagePrompt(item.combination);
      const imageBuffer = await generateOpenAIRecipeImage({ prompt });
      const imageUrl = await saveCachedImage(item.cacheKey, imageBuffer);
      item.recipes.forEach(recipe => {
        results.push({ id: recipe.id, cacheKey: item.cacheKey, combination: item.combination, imageUrl, status: "ready", cached: false });
      });
    }

    return sendJson(response, { status: "ready", images: results });
  } catch (error) {
    return sendJson(response, {
      status: "failed",
      message: "Imagem em preparo",
      error: error.message
    }, 500);
  }
}
