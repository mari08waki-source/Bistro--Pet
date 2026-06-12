import { imageCacheKey, getCachedImage, saveCachedImage } from "./_image-cache.js";
import { checkImageLimit } from "./_image-limits.js";
import { buildRecipeImagePrompt, generateOpenAIRecipeImage } from "./_openai-image.js";

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
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients.map(String).filter(Boolean) : [],
    prohibitedIngredients: Array.isArray(recipe.prohibitedIngredients) ? recipe.prohibitedIngredients.map(String).filter(Boolean) : [],
    preparation: String(recipe.preparation || recipe.prep || "").trim()
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

    const model = process.env.IMAGE_MODEL || "gpt-image-1-mini";
    const quality = process.env.IMAGE_QUALITY || "low";
    const results = [];
    const missing = [];

    for (const recipe of recipes) {
      const cacheKey = imageCacheKey({ ...recipe, model, quality });
      const cachedUrl = await getCachedImage(cacheKey);
      if (cachedUrl) {
        results.push({ id: recipe.id, cacheKey, imageUrl: cachedUrl, status: "ready", cached: true });
      } else {
        missing.push({ recipe, cacheKey });
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
      const prompt = buildRecipeImagePrompt(item.recipe);
      const imageBuffer = await generateOpenAIRecipeImage({ prompt });
      const imageUrl = await saveCachedImage(item.cacheKey, imageBuffer);
      results.push({ id: item.recipe.id, cacheKey: item.cacheKey, imageUrl, status: "ready", cached: false });
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
