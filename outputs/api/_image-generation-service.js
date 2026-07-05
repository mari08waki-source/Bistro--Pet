import { imageCacheKey, getCachedImage, saveCachedImage, weeklyPlanImageCacheKey } from "./_image-cache.js";
import { checkImageLimit, refundImageLimit } from "./_image-limits.js";
import { buildRecipeImagePrompt, buildWeeklyPlanImagePrompt } from "./_image-prompts.js";
import { validateGeneratedImageBuffer } from "./_image-validation.js";
import { generateOpenAIRecipeImage } from "./_openai-image.js";
import { simpleIngredientCombination } from "./_ingredient-combination.js";

function safeClientId(clientId) {
  return String(clientId || "").slice(0, 8);
}

export async function generateIndividualRecipeImage({ generationType, recipe, clientId, imageLog }) {
  const limit = await checkImageLimit({ generationType, clientId });
  imageLog("generation_start", {
    mode: process.env.IMAGE_GENERATION_MODE,
    generationType,
    user: safeClientId(clientId),
    allowed: limit.allowed,
    limit: limit.limit,
    period: limit.period,
    remaining: limit.remaining
  });

  if (!limit.allowed) return { blocked: true, limit };

  try {
    const prompt = buildRecipeImagePrompt(recipe);
    imageLog("gemini_call", {
      generationType,
      user: safeClientId(clientId),
      recipeId: recipe.id,
      size: "1024x1536"
    });
    const imageBuffer = validateGeneratedImageBuffer(
      await generateOpenAIRecipeImage({ prompt, size: "1024x1536" })
    );
    imageLog("gemini_response", {
      generationType,
      user: safeClientId(clientId),
      recipeId: recipe.id,
      bytes: imageBuffer.length
    });
    const cacheKey = imageCacheKey([
      generationType,
      recipe.recipeName,
      ...recipe.ingredients,
      recipe.requestId || `${Date.now()}-${Math.random()}`
    ]);
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
      hasUrl: Boolean(imageUrl),
      imageUrl
    });
    return {
      blocked: false,
      limit,
      result: { id: recipe.id, imageUrl, status: "ready", cached: false }
    };
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

export async function generateWeeklyPlanDayImage({ generationType, recipe, clientId, imageLog, forceRefresh = false }) {
  const combination = simpleIngredientCombination(recipe.ingredients);
  const cacheKey = weeklyPlanImageCacheKey(combination);
  const cachedUrl = forceRefresh ? null : await getCachedImage(cacheKey);

  if (cachedUrl) {
    imageLog("cache_hit", {
      generationType,
      user: safeClientId(clientId),
      recipeId: recipe.id,
      cacheKey
    });
    return {
      blocked: false,
      limit: null,
      result: { id: recipe.id, cacheKey, combination, imageUrl: cachedUrl, status: "ready", cached: true }
    };
  }

  const limit = await checkImageLimit({ generationType, clientId });
  imageLog("generation_start", {
    mode: process.env.IMAGE_GENERATION_MODE,
    generationType,
    user: safeClientId(clientId),
    allowed: limit.allowed,
    limit: limit.limit,
    period: limit.period,
    remaining: limit.remaining,
    recipeId: recipe.id
  });

  if (!limit.allowed) return { blocked: true, limit };

  try {
    const prompt = buildWeeklyPlanImagePrompt(combination);
    imageLog("gemini_call", {
      generationType,
      user: safeClientId(clientId),
      recipeId: recipe.id,
      size: "1024x1024"
    });
    const imageBuffer = validateGeneratedImageBuffer(await generateOpenAIRecipeImage({ prompt }));
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
      hasUrl: Boolean(imageUrl),
      imageUrl
    });
    return {
      blocked: false,
      limit,
      result: { id: recipe.id, cacheKey, combination, imageUrl, status: "ready", cached: false }
    };
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
