import { imageCacheKey, getCachedImage, saveCachedImage } from "./_image-cache.js";
import { checkImageLimit, refundImageLimit } from "./_image-limits.js";
import { buildExactRecipeImagePrompt, buildRecipeImagePrompt, generateOpenAIRecipeImage } from "./_openai-image.js";
import { simpleIngredientCombination } from "./_ingredient-combination.js";
import { identifyImageClient } from "./_image-client.js";
import { withImageRequestLock } from "./_image-request-lock.js";

const validGenerationTypes = new Set(["customRecipe", "chefSuggestion", "weeklyPlan"]);

function imageLog(event, details = {}) {
  try {
    console.info("[bistropet:image]", JSON.stringify({ event, ...details }));
  } catch (_error) {
    console.info("[bistropet:image]", event);
  }
}

function safeClientId(clientId) {
  return String(clientId || "").slice(0, 8);
}

function limitMessage(limit) {
  return `Limite temporário de imagem atingido (${limit.limit}/${limit.period}). O contador permanece protegido; tente novamente após liberar o contador de teste ou no próximo período.`;
}

function sendJson(res, response, status = 200) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store, max-age=0");
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
    const generationType = body.generationType;
    if (!validGenerationTypes.has(generationType)) {
      return sendJson(response, { error: "Invalid image generation type." }, 400);
    }
    const clientId = await identifyImageClient(request);
    if (!["live", "validate"].includes(process.env.IMAGE_GENERATION_MODE)) {
      return sendJson(response, {
        status: "disabled",
        message: "Imagem em preparo",
        images: []
      }, 503);
    }
    const recipes = (Array.isArray(body.recipes) ? body.recipes : [body.recipe]).filter(Boolean).map(normalizeRecipe);

    if (!recipes.length) return sendJson(response, { error: "No recipe provided." }, 400);
    if (generationType !== "weeklyPlan" && recipes.length !== 1) {
      return sendJson(response, { error: "Individual image requests must contain exactly one recipe." }, 400);
    }
    if (generationType === "weeklyPlan" && recipes.length !== 1) {
      return sendJson(response, { error: "Weekly image requests must contain exactly one day recipe." }, 400);
    }

    return await withImageRequestLock(`${clientId}:${generationType}`, async () => {
      if (generationType !== "weeklyPlan") {
        const limit = await checkImageLimit({ generationType, clientId });
        imageLog("generation_start", {
          generationType,
          user: safeClientId(clientId),
          allowed: limit.allowed,
          limit: limit.limit,
          period: limit.period,
          remaining: limit.remaining
        });
        if (!limit.allowed) {
          imageLog("limit_blocked", {
            generationType,
            user: safeClientId(clientId),
            limit: limit.limit,
            period: limit.period
          });
          return sendJson(response, {
            status: "limit_exceeded",
            message: limitMessage(limit),
            limit,
            images: []
          }, 429);
        }

        const results = [];
        for (const recipe of recipes) {
          try {
            const prompt = buildExactRecipeImagePrompt(recipe);
            imageLog("gemini_call", {
              generationType,
              user: safeClientId(clientId),
              recipeId: recipe.id,
              size: "1024x1536"
            });
            const imageBuffer = await generateOpenAIRecipeImage({ prompt, size: "1024x1536" });
            imageLog("gemini_response", {
              generationType,
              user: safeClientId(clientId),
              recipeId: recipe.id,
              bytes: imageBuffer.length
            });
            const uniqueKey = imageCacheKey([
              generationType,
              recipe.recipeName,
              ...recipe.ingredients,
              recipe.requestId || `${Date.now()}-${Math.random()}`
            ]);
            imageLog("storage_upload_start", {
              generationType,
              user: safeClientId(clientId),
              recipeId: recipe.id,
              cacheKey: uniqueKey
            });
            const imageUrl = await saveCachedImage(uniqueKey, imageBuffer);
            imageLog("storage_upload_done", {
              generationType,
              user: safeClientId(clientId),
              recipeId: recipe.id,
              hasUrl: Boolean(imageUrl)
            });
            results.push({ id: recipe.id, imageUrl, status: "ready", cached: false });
          } catch (error) {
            const refundedCount = await refundImageLimit({ generationType, clientId });
            imageLog("generation_failed_refunded", {
              generationType,
              user: safeClientId(clientId),
              recipeId: recipe.id,
              refundedCount,
              error: error.message
            });
            throw error;
          }
        }
        imageLog("frontend_response", {
          generationType,
          user: safeClientId(clientId),
          images: results.length,
          status: "ready"
        });
        return sendJson(response, { status: "ready", images: results, limit });
      }

      const results = [];
      let limit = null;
      for (const recipe of recipes) {
        const combination = simpleIngredientCombination(recipe.ingredients);
        const cacheKey = imageCacheKey(combination);
        const cachedUrl = await getCachedImage(cacheKey);
        if (cachedUrl) {
          imageLog("cache_hit", {
            generationType,
            user: safeClientId(clientId),
            recipeId: recipe.id,
            cacheKey
          });
          results.push({ id: recipe.id, cacheKey, combination, imageUrl: cachedUrl, status: "ready", cached: true });
          continue;
        }

        limit = await checkImageLimit({ generationType, clientId });
        imageLog("generation_start", {
          generationType,
          user: safeClientId(clientId),
          allowed: limit.allowed,
          limit: limit.limit,
          period: limit.period,
          remaining: limit.remaining,
          recipeId: recipe.id
        });
        if (!limit.allowed) {
          imageLog("limit_blocked", {
            generationType,
            user: safeClientId(clientId),
            limit: limit.limit,
            period: limit.period,
            recipeId: recipe.id
          });
          return sendJson(response, {
            status: "limit_exceeded",
            message: limitMessage(limit),
            limit,
            images: []
          }, 429);
        }
        try {
          const prompt = buildRecipeImagePrompt(combination);
          imageLog("gemini_call", {
            generationType,
            user: safeClientId(clientId),
            recipeId: recipe.id,
            size: "1024x1024"
          });
          const imageBuffer = await generateOpenAIRecipeImage({ prompt });
          imageLog("gemini_response", {
            generationType,
            user: safeClientId(clientId),
            recipeId: recipe.id,
            bytes: imageBuffer.length
          });
          imageLog("storage_upload_start", {
            generationType,
            user: safeClientId(clientId),
            recipeId: recipe.id,
            cacheKey
          });
          const imageUrl = await saveCachedImage(cacheKey, imageBuffer);
          imageLog("storage_upload_done", {
            generationType,
            user: safeClientId(clientId),
            recipeId: recipe.id,
            hasUrl: Boolean(imageUrl)
          });
          results.push({ id: recipe.id, cacheKey, combination, imageUrl, status: "ready", cached: false });
        } catch (error) {
          const refundedCount = await refundImageLimit({ generationType, clientId });
          imageLog("generation_failed_refunded", {
            generationType,
            user: safeClientId(clientId),
            recipeId: recipe.id,
            refundedCount,
            error: error.message
          });
          throw error;
        }
      }

      imageLog("frontend_response", {
        generationType,
        user: safeClientId(clientId),
        images: results.length,
        status: "ready"
      });
      return sendJson(response, { status: "ready", images: results, limit });
    });
  } catch (error) {
    if (error.code === "AUTH_REQUIRED") {
      return sendJson(response, {
        status: "unauthorized",
        error: "Authentication required."
      }, 401);
    }
    if (error.code === "IMAGE_REQUEST_IN_PROGRESS") {
      return sendJson(response, {
        status: "request_in_progress",
        message: "Imagem em preparo",
        images: []
      }, 409);
    }
    return sendJson(response, {
      status: "failed",
      message: "Imagem em preparo",
      error: "Image generation temporarily unavailable."
    }, 500);
  }
}
